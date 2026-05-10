const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "payments-service",
  describe: "Processes invoice payments through the fake gateway and coordinates invoice settlement.",
  basePath: "/payments",
  modelName: "Payment",
  allowedFilters: ["invoiceId", "patientId", "status", "currency"],
  schemaDefinition: {
    paymentNumber: {
      type: String,
      unique: true,
      default: () => `PAY-${Date.now()}`,
    },
    invoiceId: { type: String, required: true },
    patientId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    paymentMethod: {
      methodType: {
        type: String,
        default: "card",
      },
      provider: String,
      holderName: String,
      last4: String,
    },
    gatewayTransactionId: String,
    gatewayStatus: String,
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    notes: String,
    paidAt: Date,
    refundedAt: Date,
  },
  customRoutes: (router, Model, helpers, wrapAsync) => {
    router.post(
      "/process",
      wrapAsync(async (req, res) => {
        const paymentRequest = {
          invoiceId: req.body.invoiceId,
          amount: Number(req.body.amount),
          currency: req.body.currency || "USD",
          method: req.body.paymentMethod || {},
          metadata: {
            patientId: req.body.patientId,
            initiatedBy: req.body.initiatedBy || "api",
          },
        };

        const gatewayTransaction = await helpers.requestJson(
          `${process.env.FAKE_PAYMENT_GATEWAY_URL}/transactions/charge`,
          {
            method: "POST",
            body: JSON.stringify(paymentRequest),
          }
        );

        const isPaid = gatewayTransaction.status === "captured";

        if (isPaid) {
          await helpers.requestJson(`${process.env.BILLING_SERVICE_URL}/invoices/${req.body.invoiceId}/mark-paid`, {
            method: "POST",
            body: JSON.stringify({
              paymentReference: gatewayTransaction.transactionReference,
            }),
          });
        }

        const payment = await Model.create({
          invoiceId: req.body.invoiceId,
          patientId: req.body.patientId,
          amount: paymentRequest.amount,
          currency: paymentRequest.currency,
          paymentMethod: {
            ...paymentRequest.method,
            last4: String(paymentRequest.method?.cardNumber || "").slice(-4),
          },
          gatewayTransactionId: gatewayTransaction.id,
          gatewayStatus: gatewayTransaction.status,
          status: isPaid ? "paid" : "failed",
          paidAt: isPaid ? new Date() : undefined,
          notes: gatewayTransaction.reason,
        });

        await helpers.notify({
          recipientType: "patient",
          recipientId: req.body.patientId,
          channel: "email",
          subject: isPaid ? "Payment Successful" : "Payment Failed",
          message: isPaid
            ? `Payment ${payment.paymentNumber} was captured successfully.`
            : `Payment ${payment.paymentNumber} failed during processing.`,
          metadata: {
            invoiceId: payment.invoiceId,
            paymentId: payment.id,
          },
        });

        res.status(201).json({
          payment,
          gatewayTransaction,
        });
      })
    );

    router.post(
      "/:id/refund",
      wrapAsync(async (req, res) => {
        const payment = await Model.findById(req.params.id);

        if (!payment) {
          return res.status(404).json({ message: "Payment not found" });
        }

        const gatewayTransaction = await helpers.requestJson(
          `${process.env.FAKE_PAYMENT_GATEWAY_URL}/transactions/${payment.gatewayTransactionId}/refund`,
          {
            method: "POST",
            body: JSON.stringify({
              reason: req.body.reason || "Requested refund",
            }),
          }
        );

        payment.status = "refunded";
        payment.gatewayStatus = gatewayTransaction.status;
        payment.refundedAt = new Date();
        payment.notes = req.body.reason || payment.notes;
        await payment.save();

        await helpers.notify({
          recipientType: "patient",
          recipientId: payment.patientId,
          channel: "email",
          subject: "Payment Refunded",
          message: `Payment ${payment.paymentNumber} has been refunded.`,
          metadata: {
            invoiceId: payment.invoiceId,
            paymentId: payment.id,
          },
        });

        return res.json({
          payment,
          gatewayTransaction,
        });
      })
    );
  },
}).catch((error) => {
  console.error("payments-service failed to start", error);
  process.exit(1);
});
