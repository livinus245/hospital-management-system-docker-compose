const { createServiceApp } = require("../../../shared/src/serviceFactory");

function calculateInvoiceTotals(items = [], taxRate = 0.1) {
  const subtotal = items.reduce(
    (total, item) => total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0
  );
  const tax = Number((subtotal * Number(taxRate || 0)).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  return {
    subtotal,
    tax,
    total,
  };
}

createServiceApp({
  serviceName: "billing-service",
  describe: "Creates and manages invoices for appointments, admissions, and ancillary charges.",
  basePath: "/invoices",
  modelName: "Invoice",
  allowedFilters: ["patientId", "appointmentId", "admissionId", "status", "currency"],
  schemaDefinition: {
    invoiceNumber: {
      type: String,
      unique: true,
      default: () => `INV-${Date.now()}`,
    },
    patientId: { type: String, required: true },
    appointmentId: String,
    admissionId: String,
    currency: { type: String, default: "USD" },
    items: {
      type: [
        {
          description: { type: String, required: true },
          quantity: { type: Number, default: 1 },
          unitPrice: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0.1 },
    status: {
      type: String,
      enum: ["draft", "issued", "paid", "overdue", "cancelled"],
      default: "issued",
    },
    dueDate: Date,
    paymentReference: String,
    notes: String,
  },
  transformCreate: async ({ body }) => {
    const totals = calculateInvoiceTotals(body.items, body.taxRate);
    return {
      ...body,
      ...totals,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      status: body.status || "issued",
    };
  },
  transformUpdate: async ({ body, existing }) => {
    const items = body.items || existing.items;
    const taxRate = body.taxRate ?? existing.taxRate;
    return {
      ...body,
      ...calculateInvoiceTotals(items, taxRate),
      ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
    };
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.get(
      "/status/:status",
      wrapAsync(async (req, res) => {
        const items = await Model.find({ status: req.params.status }).sort({ createdAt: -1 });
        res.json({ items });
      })
    );

    router.post(
      "/:id/recalculate",
      wrapAsync(async (req, res) => {
        const invoice = await Model.findById(req.params.id);

        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        Object.assign(invoice, calculateInvoiceTotals(invoice.items, invoice.taxRate));
        await invoice.save();
        return res.json(invoice);
      })
    );

    router.post(
      "/:id/mark-paid",
      wrapAsync(async (req, res) => {
        const invoice = await Model.findById(req.params.id);

        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        invoice.status = "paid";
        invoice.paymentReference = req.body.paymentReference || invoice.paymentReference;
        await invoice.save();

        return res.json(invoice);
      })
    );
  },
}).catch((error) => {
  console.error("billing-service failed to start", error);
  process.exit(1);
});
