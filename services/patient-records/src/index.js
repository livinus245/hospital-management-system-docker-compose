const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "patient-records-service",
  describe: "Maintains patient demographics, insurance details, allergies, and medical history.",
  basePath: "/patients",
  modelName: "PatientRecord",
  allowedFilters: ["mrn", "lastName", "insuranceProvider", "bloodType"],
  schemaDefinition: {
    mrn: {
      type: String,
      unique: true,
      default: () => `MRN-${Date.now()}`,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },
    allergies: {
      type: [String],
      default: [],
    },
    medicalHistory: {
      type: [
        {
          condition: { type: String, required: true },
          notes: String,
          diagnosedOn: Date,
        },
      ],
      default: [],
    },
    insuranceProvider: String,
    insuranceNumber: String,
    bloodType: String,
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.get(
      "/search",
      wrapAsync(async (req, res) => {
        const query = (req.query.q || req.query.query || "").trim();

        if (!query) {
          return res.json({ items: [] });
        }

        const matcher = new RegExp(query, "i");
        const items = await Model.find({
          $or: [
            { firstName: matcher },
            { lastName: matcher },
            { mrn: matcher },
            { email: matcher },
            { phone: matcher },
          ],
        }).sort({ createdAt: -1 });

        return res.json({ items });
      })
    );

    router.get(
      "/summary/overview",
      wrapAsync(async (_req, res) => {
        const [totalPatients, insuredPatients] = await Promise.all([
          Model.countDocuments(),
          Model.countDocuments({ insuranceProvider: { $nin: [null, ""] } }),
        ]);

        res.json({
          totalPatients,
          insuredPatients,
          uninsuredPatients: totalPatients - insuredPatients,
        });
      })
    );

    router.post(
      "/:id/history",
      wrapAsync(async (req, res) => {
        const patient = await Model.findById(req.params.id);

        if (!patient) {
          return res.status(404).json({ message: "Patient record not found" });
        }

        patient.medicalHistory.push({
          condition: req.body.condition,
          notes: req.body.notes,
          diagnosedOn: req.body.diagnosedOn || new Date(),
        });

        await patient.save();
        return res.json(patient);
      })
    );

    router.post(
      "/:id/allergies",
      wrapAsync(async (req, res) => {
        const patient = await Model.findById(req.params.id);

        if (!patient) {
          return res.status(404).json({ message: "Patient record not found" });
        }

        const allergy = (req.body.allergy || "").trim();
        if (allergy && !patient.allergies.includes(allergy)) {
          patient.allergies.push(allergy);
          await patient.save();
        }

        return res.json(patient);
      })
    );
  },
}).catch((error) => {
  console.error("patient-records-service failed to start", error);
  process.exit(1);
});
