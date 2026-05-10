const { createServiceApp } = require("../../../shared/src/serviceFactory");

function determineGatewayStatus(amount, method = {}) {
  const methodType = (method.methodType || "").toLowerCase();
  const cardNumber = String(method.cardNumber || "");

  if (methodType === "declined" || amount > 10000 || cardNumber.endsWith("0")) {
    return {
      status: "failed",
      reason: "Simulated processor decline",
    };
  }

  return {
    status: "captured",
    reason: "Simulated payment approved",
  };
}

createServiceApp({
  serviceName: "fake-payment-gateway",
  describe: "Simulates authorization, capture, and refund flows for testing payment integrations.",
  basePath: "/transactions",
  modelName: "GatewayTransaction",
  allowedFilters: ["invoiceId", "status", "currency"],
  schemaDefinition: {
    transactionReference: {
      type: String,
      unique: true,
      default: () => `GTW-${Date.now()}`,
    },
    invoiceId: String,
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    method: {
      methodType: {
        type: String,
        default: "card",
      },
      provider: String,
      holderName: String,
      last4: String,
      cardNumber: String,
    },
    status: {
      type: String,
      enum: ["authorized", "captured", "failed", "refunded"],
      default: "captured",
    },
    reason: String,
    metadata: Object,
    processedAt: { type: Date, default: Date.now },
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.get("/methods", (_req, res) => {
      res.json({
        methods: [
          { methodType: "card", provider: "Visa", cardNumber: "4111111111111111", description: "Simulated success card" },
          { methodType: "card", provider: "Mastercard", cardNumber: "5555555555554444", description: "Alternative success card" },
          { methodType: "declined", provider: "Sandbox", cardNumber: "4000000000000000", description: "Forces a simulated decline" },
          { methodType: "insurance", provider: "Test Insurance", description: "Mock insurance settlement" },
        ],
      });
    });

    router.post(
      "/charge",
      wrapAsync(async (req, res) => {
        const outcome = determineGatewayStatus(Number(req.body.amount), req.body.method);
        const document = await Model.create({
          invoiceId: req.body.invoiceId,
          amount: Number(req.body.amount),
          currency: req.body.currency || "USD",
          method: {
            ...req.body.method,
            last4: String(req.body.method?.cardNumber || "").slice(-4),
          },
          status: outcome.status,
          reason: outcome.reason,
          metadata: req.body.metadata || {},
        });

        res.status(201).json(document);
      })
    );

    router.post(
      "/:id/refund",
      wrapAsync(async (req, res) => {
        const transaction = await Model.findById(req.params.id);

        if (!transaction) {
          return res.status(404).json({ message: "Gateway transaction not found" });
        }

        transaction.status = "refunded";
        transaction.reason = req.body.reason || "Refund requested by payments service";
        await transaction.save();

        return res.json(transaction);
      })
    );
  },
}).catch((error) => {
  console.error("fake-payment-gateway failed to start", error);
  process.exit(1);
});
