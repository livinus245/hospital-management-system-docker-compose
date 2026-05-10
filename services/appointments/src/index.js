const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "appointments-service",
  describe: "Schedules, confirms, cancels, and reschedules doctor appointments.",
  basePath: "/appointments",
  modelName: "Appointment",
  allowedFilters: ["patientId", "physicianId", "status", "channel"],
  schemaDefinition: {
    appointmentNumber: {
      type: String,
      unique: true,
      default: () => `APT-${Date.now()}`,
    },
    patientId: { type: String, required: true },
    physicianId: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30 },
    reason: { type: String, required: true },
    notes: String,
    channel: {
      type: String,
      enum: ["in-person", "video", "phone"],
      default: "in-person",
    },
    location: String,
    status: {
      type: String,
      enum: ["scheduled", "confirmed", "completed", "cancelled", "rescheduled"],
      default: "scheduled",
    },
    confirmedAt: Date,
    cancelledAt: Date,
  },
  transformCreate: async ({ body }) => ({
    ...body,
    scheduledAt: new Date(body.scheduledAt),
    status: body.status || "scheduled",
  }),
  transformUpdate: async ({ body }) => ({
    ...body,
    ...(body.scheduledAt ? { scheduledAt: new Date(body.scheduledAt) } : {}),
  }),
  afterCreate: async ({ document, helpers }) => {
    await helpers.notify({
      recipientType: "patient",
      recipientId: document.patientId,
      channel: "email",
      subject: "Appointment Scheduled",
      message: `Appointment ${document.appointmentNumber} is scheduled for ${document.scheduledAt.toISOString()}.`,
      metadata: {
        appointmentId: document.id,
        physicianId: document.physicianId,
      },
    });
  },
  afterUpdate: async ({ document, helpers }) => {
    await helpers.notify({
      recipientType: "patient",
      recipientId: document.patientId,
      channel: "email",
      subject: "Appointment Updated",
      message: `Appointment ${document.appointmentNumber} is now ${document.status}.`,
      metadata: {
        appointmentId: document.id,
        physicianId: document.physicianId,
        status: document.status,
      },
    });
  },
  customRoutes: (router, Model, helpers, wrapAsync) => {
    router.get(
      "/calendar/day/:date",
      wrapAsync(async (req, res) => {
        const day = new Date(req.params.date);
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);

        const items = await Model.find({
          scheduledAt: {
            $gte: day,
            $lt: nextDay,
          },
        }).sort({ scheduledAt: 1 });

        res.json({ items });
      })
    );

    router.post(
      "/:id/confirm",
      wrapAsync(async (req, res) => {
        const appointment = await Model.findById(req.params.id);

        if (!appointment) {
          return res.status(404).json({ message: "Appointment not found" });
        }

        appointment.status = "confirmed";
        appointment.confirmedAt = new Date();
        await appointment.save();

        await helpers.notify({
          recipientType: "patient",
          recipientId: appointment.patientId,
          channel: "sms",
          subject: "Appointment Confirmed",
          message: `Appointment ${appointment.appointmentNumber} has been confirmed.`,
          metadata: { appointmentId: appointment.id },
        });

        return res.json(appointment);
      })
    );

    router.post(
      "/:id/cancel",
      wrapAsync(async (req, res) => {
        const appointment = await Model.findById(req.params.id);

        if (!appointment) {
          return res.status(404).json({ message: "Appointment not found" });
        }

        appointment.status = "cancelled";
        appointment.cancelledAt = new Date();
        appointment.notes = req.body.reason || appointment.notes;
        await appointment.save();

        await helpers.notify({
          recipientType: "patient",
          recipientId: appointment.patientId,
          channel: "sms",
          subject: "Appointment Cancelled",
          message: `Appointment ${appointment.appointmentNumber} has been cancelled.`,
          metadata: { appointmentId: appointment.id },
        });

        return res.json(appointment);
      })
    );

    router.post(
      "/:id/reschedule",
      wrapAsync(async (req, res) => {
        const appointment = await Model.findById(req.params.id);

        if (!appointment) {
          return res.status(404).json({ message: "Appointment not found" });
        }

        appointment.status = "rescheduled";
        appointment.scheduledAt = new Date(req.body.scheduledAt);
        appointment.notes = req.body.notes || appointment.notes;
        await appointment.save();

        await helpers.notify({
          recipientType: "patient",
          recipientId: appointment.patientId,
          channel: "email",
          subject: "Appointment Rescheduled",
          message: `Appointment ${appointment.appointmentNumber} has been moved to ${appointment.scheduledAt.toISOString()}.`,
          metadata: { appointmentId: appointment.id },
        });

        return res.json(appointment);
      })
    );
  },
}).catch((error) => {
  console.error("appointments-service failed to start", error);
  process.exit(1);
});
