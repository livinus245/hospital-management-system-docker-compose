const { createServiceApp } = require("../../../shared/src/serviceFactory");

createServiceApp({
  serviceName: "administration-service",
  describe: "Manages hospital staff accounts, departments, permissions, and operational summaries.",
  basePath: "/staff",
  modelName: "StaffMember",
  allowedFilters: ["role", "department", "status"],
  schemaDefinition: {
    staffId: {
      type: String,
      unique: true,
      default: () => `STF-${Date.now()}`,
    },
    name: { type: String, required: true },
    role: { type: String, required: true },
    department: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    permissions: {
      type: [String],
      default: [],
    },
    managedDepartments: {
      type: [String],
      default: [],
    },
    lastLoginAt: Date,
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.get(
      "/departments/summary",
      wrapAsync(async (_req, res) => {
        const summary = await Model.aggregate([
          {
            $group: {
              _id: "$department",
              staffCount: { $sum: 1 },
              activeCount: {
                $sum: {
                  $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                },
              },
            },
          },
          {
            $sort: { staffCount: -1 },
          },
        ]);

        res.json({ summary });
      })
    );

    router.get(
      "/roles/list",
      wrapAsync(async (_req, res) => {
        const roles = await Model.distinct("role");
        res.json({ roles });
      })
    );

    router.post(
      "/:id/login",
      wrapAsync(async (req, res) => {
        const staffMember = await Model.findById(req.params.id);

        if (!staffMember) {
          return res.status(404).json({ message: "Staff member not found" });
        }

        staffMember.lastLoginAt = new Date();
        await staffMember.save();

        return res.json(staffMember);
      })
    );
  },
}).catch((error) => {
  console.error("administration-service failed to start", error);
  process.exit(1);
});
