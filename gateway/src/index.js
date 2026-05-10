const express = require("express");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = Number(process.env.PORT || 8080);

const serviceRegistry = [
  { name: "patient-records", route: "/api/patient-records", target: process.env.PATIENT_RECORDS_SERVICE_URL },
  { name: "physicians", route: "/api/physicians", target: process.env.PHYSICIANS_SERVICE_URL },
  { name: "appointments", route: "/api/appointments", target: process.env.APPOINTMENTS_SERVICE_URL },
  { name: "waittime", route: "/api/waittime", target: process.env.WAITTIME_SERVICE_URL },
  { name: "admission", route: "/api/admission", target: process.env.ADMISSION_SERVICE_URL },
  { name: "billing", route: "/api/billing", target: process.env.BILLING_SERVICE_URL },
  { name: "fake-payment-gateway", route: "/api/fake-payment-gateway", target: process.env.FAKE_PAYMENT_GATEWAY_URL },
  { name: "payments", route: "/api/payments", target: process.env.PAYMENTS_SERVICE_URL },
  { name: "notifications", route: "/api/notifications", target: process.env.NOTIFICATIONS_SERVICE_URL },
  { name: "administration", route: "/api/administration", target: process.env.ADMINISTRATION_SERVICE_URL },
];

app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    name: "hospital-management-api-gateway",
    status: "ok",
    routes: serviceRegistry.map((service) => ({
      name: service.name,
      route: service.route,
      target: service.target,
    })),
  });
});

app.get("/health", async (_req, res) => {
  const serviceStatuses = await Promise.all(
    serviceRegistry.map(async (service) => {
      try {
        const response = await fetch(`${service.target}/health`);
        const payload = await response.json();
        return {
          name: service.name,
          status: response.ok ? "ok" : "degraded",
          details: payload,
        };
      } catch (error) {
        return {
          name: service.name,
          status: "down",
          details: error.message,
        };
      }
    })
  );

  res.json({
    gateway: "ok",
    services: serviceStatuses,
  });
});

serviceRegistry.forEach((service) => {
  app.use(
    service.route,
    createProxyMiddleware({
      target: service.target,
      changeOrigin: true,
      pathRewrite: {
        [`^${service.route}`]: "",
      },
    })
  );
});

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
