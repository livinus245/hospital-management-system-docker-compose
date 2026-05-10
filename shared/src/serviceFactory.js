const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");

const { requestJson } = require("./http");
const { createReference } = require("./reference");

function pickFilters(query, allowedFilters = []) {
  return allowedFilters.reduce((filters, field) => {
    if (query[field] === undefined) {
      return filters;
    }

    const value = query[field];
    filters[field] = typeof value === "string" && value.includes(",") ? { $in: value.split(",") } : value;
    return filters;
  }, {});
}

function wrapAsync(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

async function createServiceApp(config) {
  const {
    serviceName,
    basePath,
    modelName,
    schemaDefinition,
    schemaOptions = {},
    allowedFilters = [],
    defaultSort = { createdAt: -1 },
    describe,
    transformCreate,
    transformUpdate,
    afterCreate,
    afterUpdate,
    customRoutes,
  } = config;

  const app = express();
  const port = Number(process.env.PORT || 3000);
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error(`MONGO_URI is required for ${serviceName}`);
  }

  await mongoose.connect(mongoUri);

  const schema = new mongoose.Schema(schemaDefinition, {
    timestamps: true,
    minimize: false,
    ...schemaOptions,
  });

  const Model = mongoose.models[modelName] || mongoose.model(modelName, schema);

  const helpers = {
    createReference,
    mongoose,
    requestJson,
    notify: async (payload) => {
      if (!process.env.NOTIFICATIONS_SERVICE_URL) {
        return null;
      }

      return requestJson(`${process.env.NOTIFICATIONS_SERVICE_URL}/notifications/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };

  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));

  app.get("/", (_req, res) => {
    res.json({
      service: serviceName,
      status: "ok",
      database: mongoose.connection.name,
      description: describe,
      endpoints: {
        health: "/health",
        collection: basePath,
      },
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      service: serviceName,
      status: "ok",
      databaseState: mongoose.connection.readyState,
      timestamp: new Date().toISOString(),
    });
  });

  const router = express.Router();

  router.get(
    "/",
    wrapAsync(async (req, res) => {
      const page = Math.max(Number.parseInt(req.query.page || "1", 10), 1);
      const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize || "20", 10), 1), 100);
      const filters = pickFilters(req.query, allowedFilters);
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        Model.find(filters).sort(defaultSort).skip(skip).limit(pageSize),
        Model.countDocuments(filters),
      ]);

      res.json({
        items,
        meta: {
          total,
          page,
          pageSize,
        },
      });
    })
  );

  router.post(
    "/",
    wrapAsync(async (req, res) => {
      const payload = transformCreate
        ? await transformCreate({ body: req.body, req, Model, helpers })
        : req.body;

      const document = await Model.create(payload);

      if (afterCreate) {
        await afterCreate({ document, req, Model, helpers });
      }

      res.status(201).json(document);
    })
  );

  if (customRoutes) {
    customRoutes(router, Model, helpers, wrapAsync);
  }

  router.get(
    "/:id",
    wrapAsync(async (req, res) => {
      const document = await Model.findById(req.params.id);

      if (!document) {
        return res.status(404).json({ message: `${modelName} not found` });
      }

      return res.json(document);
    })
  );

  router.patch(
    "/:id",
    wrapAsync(async (req, res) => {
      const document = await Model.findById(req.params.id);

      if (!document) {
        return res.status(404).json({ message: `${modelName} not found` });
      }

      const previous = document.toObject();
      const payload = transformUpdate
        ? await transformUpdate({ body: req.body, existing: document, req, Model, helpers })
        : req.body;

      Object.assign(document, payload);
      await document.save();

      if (afterUpdate) {
        await afterUpdate({ document, previous, req, Model, helpers });
      }

      res.json(document);
    })
  );

  router.delete(
    "/:id",
    wrapAsync(async (req, res) => {
      const document = await Model.findByIdAndDelete(req.params.id);

      if (!document) {
        return res.status(404).json({ message: `${modelName} not found` });
      }

      res.json({
        message: `${modelName} deleted successfully`,
        id: req.params.id,
      });
    })
  );

  app.use(basePath, router);

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({
      service: serviceName,
      message: error.message || "Unexpected service error",
      details: error.payload || null,
    });
  });

  app.listen(port, () => {
    console.log(`${serviceName} listening on port ${port}`);
  });
}

module.exports = {
  createServiceApp,
};
