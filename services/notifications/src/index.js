const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "notifications-service",
  describe: "Stores and simulates outbound messages across email, SMS, and in-app channels.",
  basePath: "/notifications",
  modelName: "Notification",
  allowedFilters: ["recipientType", "recipientId", "channel", "status"],
  schemaDefinition: {
    notificationId: {
      type: String,
      unique: true,
      default: () => `NTF-${Date.now()}`,
    },
    recipientType: {
      type: String,
      enum: ["patient", "staff", "system"],
      default: "patient",
    },
    recipientId: { type: String, required: true },
    channel: {
      type: String,
      enum: ["email", "sms", "in-app"],
      default: "email",
    },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "sent", "delivered", "failed"],
      default: "queued",
    },
    scheduledFor: Date,
    sentAt: Date,
    metadata: Object,
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.post(
      "/send",
      wrapAsync(async (req, res) => {
        const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : null;
        const shouldSendNow = !scheduledFor || scheduledFor <= new Date();

        const notification = await Model.create({
          ...req.body,
          scheduledFor: scheduledFor || undefined,
          status: shouldSendNow ? "sent" : "queued",
          sentAt: shouldSendNow ? new Date() : undefined,
        });

        res.status(201).json(notification);
      })
    );

    router.post(
      "/:id/mark-delivered",
      wrapAsync(async (req, res) => {
        const notification = await Model.findById(req.params.id);

        if (!notification) {
          return res.status(404).json({ message: "Notification not found" });
        }

        notification.status = "delivered";
        if (!notification.sentAt) {
          notification.sentAt = new Date();
        }
        await notification.save();

        return res.json(notification);
      })
    );

    router.get(
      "/status/:status",
      wrapAsync(async (req, res) => {
        const items = await Model.find({ status: req.params.status }).sort({ createdAt: -1 });
        res.json({ items });
      })
    );
  },
}).catch((error) => {
  console.error("notifications-service failed to start", error);
  process.exit(1);
});
