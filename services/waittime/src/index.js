const { createServiceApp } = require("../../../shared/src/serviceFactory");

const TRIAGE_PRIORITY = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

async function calculateEstimatedWait(Model, queueData, currentId) {
  const departmentQueue = await Model.find({
    department: queueData.department,
    status: { $in: ["waiting", "in-progress"] },
    ...(currentId ? { _id: { $ne: currentId } } : {}),
  }).sort({ arrivedAt: 1 });

  const currentPriority = TRIAGE_PRIORITY[queueData.triageLevel] ?? TRIAGE_PRIORITY.medium;

  return departmentQueue.reduce((total, item) => {
    const itemPriority = TRIAGE_PRIORITY[item.triageLevel] ?? TRIAGE_PRIORITY.medium;
    const aheadOfCurrent =
      itemPriority < currentPriority ||
      (itemPriority === currentPriority && new Date(item.arrivedAt) <= new Date(queueData.arrivedAt || new Date()));

    return aheadOfCurrent ? total + (item.averageServiceMinutes || 15) : total;
  }, 0);
}

createServiceApp({
  serviceName: "waittime-service",
  describe: "Tracks queues by department and estimates patient wait times based on triage priority.",
  basePath: "/queues",
  modelName: "QueueEntry",
  allowedFilters: ["patientId", "department", "triageLevel", "status"],
  schemaDefinition: {
    queueNumber: {
      type: String,
      unique: true,
      default: () => `QUE-${Date.now()}`,
    },
    patientId: { type: String, required: true },
    physicianId: String,
    department: { type: String, required: true },
    triageLevel: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["waiting", "in-progress", "completed", "cancelled"],
      default: "waiting",
    },
    averageServiceMinutes: { type: Number, default: 15 },
    estimatedWaitMinutes: { type: Number, default: 0 },
    arrivedAt: { type: Date, default: Date.now },
    notes: String,
  },
  transformCreate: async ({ body, Model }) => {
    const queueData = {
      ...body,
      arrivedAt: body.arrivedAt ? new Date(body.arrivedAt) : new Date(),
    };

    return {
      ...queueData,
      estimatedWaitMinutes: await calculateEstimatedWait(Model, queueData),
    };
  },
  transformUpdate: async ({ body, existing, Model }) => {
    const queueData = {
      ...existing.toObject(),
      ...body,
      arrivedAt: body.arrivedAt ? new Date(body.arrivedAt) : existing.arrivedAt,
    };

    return {
      ...body,
      estimatedWaitMinutes: await calculateEstimatedWait(Model, queueData, existing.id),
    };
  },
  customRoutes: (router, Model, _helpers, wrapAsync) => {
    router.get(
      "/departments/:department/estimate",
      wrapAsync(async (req, res) => {
        const items = await Model.find({
          department: req.params.department,
          status: { $in: ["waiting", "in-progress"] },
        }).sort({ arrivedAt: 1 });

        const totalWaitMinutes = items.reduce((total, item) => total + (item.averageServiceMinutes || 15), 0);
        res.json({
          department: req.params.department,
          activeQueue: items.length,
          estimatedDepartmentWaitMinutes: totalWaitMinutes,
          items,
        });
      })
    );

    router.post(
      "/:id/advance",
      wrapAsync(async (req, res) => {
        const queueEntry = await Model.findById(req.params.id);

        if (!queueEntry) {
          return res.status(404).json({ message: "Queue entry not found" });
        }

        queueEntry.status = req.body.status || "in-progress";
        if (queueEntry.status === "completed") {
          queueEntry.estimatedWaitMinutes = 0;
        }
        await queueEntry.save();

        return res.json(queueEntry);
      })
    );
  },
}).catch((error) => {
  console.error("waittime-service failed to start", error);
  process.exit(1);
});
