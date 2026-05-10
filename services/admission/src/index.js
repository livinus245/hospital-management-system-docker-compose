const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "admission-service",
  describe: "Handles patient admissions, room assignment, and discharge workflows.",
  basePath: "/admissions",
  modelName: "Admission",
  allowedFilters: ["patientId", "department", "status", "admissionType"],
  schemaDefinition: {
    admissionNumber: {
      type: String,
      unique: true,
      default: () => `ADM-${Date.now()}`,
    },
    patientId: { type: String, required: true },
    admissionType: {
      type: String,
      enum: ["emergency", "inpatient", "outpatient"],
      default: "inpatient",
    },
    department: { type: String, required: true },
    roomNumber: String,
    bedNumber: String,
    attendingPhysicianId: String,
    reason: String,
    status: {
      type: String,
      enum: ["pending", "admitted", "discharged"],
      default: "admitted",
    },
    admittedAt: { type: Date, default: Date.now },
    dischargedAt: Date,
  },
  afterCreate: async ({ document, helpers }) => {
    await helpers.notify({
      recipientType: "patient",
      recipientId: document.patientId,
      channel: "email",
      subject: "Admission Created",
      message: `Admission ${document.admissionNumber} has been created in ${document.department}.`,
      metadata: {
        admissionId: document.id,
        roomNumber: document.roomNumber,
      },
    });
  },
  customRoutes: (router, Model, helpers, wrapAsync) => {
    router.get(
      "/active/list",
      wrapAsync(async (_req, res) => {
        const items = await Model.find({ status: "admitted" }).sort({ admittedAt: -1 });
        res.json({ items });
      })
    );

    router.post(
      "/:id/discharge",
      wrapAsync(async (req, res) => {
        const admission = await Model.findById(req.params.id);

        if (!admission) {
          return res.status(404).json({ message: "Admission not found" });
        }

        admission.status = "discharged";
        admission.dischargedAt = new Date();
        admission.reason = req.body.summary || admission.reason;
        await admission.save();

        await helpers.notify({
          recipientType: "patient",
          recipientId: admission.patientId,
          channel: "email",
          subject: "Discharge Completed",
          message: `Admission ${admission.admissionNumber} has been discharged.`,
          metadata: {
            admissionId: admission.id,
            dischargedAt: admission.dischargedAt,
          },
        });

        return res.json(admission);
      })
    );
  },
}).catch((error) => {
  console.error("admission-service failed to start", error);
  process.exit(1);
});
