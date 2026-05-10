const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "physicians-service",
  describe: "Maintains physician directory, specialties, departments, and shift availability.",
  basePath: "/physicians",
  modelName: "Physician",
  allowedFilters: ["specialty", "department", "status"],
  schemaDefinition: {
    physicianId: {
      type: String,
      unique: true,
      default: () => `PHY-${Date.now()}`,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    specialty: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    phone: String,
    email: String,
    room: String,
    status: {
      type: String,
      enum: ["available", "on-leave", "busy", "offline"],
      default: "available",
    },
    consultationFee: { type: Number, default: 0 },
    availability: {
      type: [
        {
          day: String,
          start: String,
          end: String,
        },
      ],
      default: [],
    },
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.get(
      "/directory/search",
      wrapAsync(async (req, res) => {
        const specialty = (req.query.specialty || "").trim();
        const department = (req.query.department || "").trim();

        const filters = {};
        if (specialty) {
          filters.specialty = new RegExp(specialty, "i");
        }
        if (department) {
          filters.department = new RegExp(department, "i");
        }

        const items = await Model.find(filters).sort({ lastName: 1, firstName: 1 });
        res.json({ items });
      })
    );

    router.get(
      "/specialties/list",
      wrapAsync(async (_req, res) => {
        const specialties = await Model.distinct("specialty");
        res.json({ specialties });
      })
    );

    router.get(
      "/dashboard/summary",
      wrapAsync(async (_req, res) => {
        const [total, available, busy] = await Promise.all([
          Model.countDocuments(),
          Model.countDocuments({ status: "available" }),
          Model.countDocuments({ status: "busy" }),
        ]);

        res.json({
          total,
          available,
          busy,
          utilizationRate: total === 0 ? 0 : Number(((busy / total) * 100).toFixed(2)),
        });
      })
    );
  },
}).catch((error) => {
  console.error("physicians-service failed to start", error);
  process.exit(1);
});
