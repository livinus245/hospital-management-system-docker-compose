# Hospital Management System

A Docker Compose based hospital management platform built with a microservices architecture, Node.js services, and MongoDB.

## Architecture

The stack contains these containers:

- `api-gateway` for a single public entrypoint and service routing
- `mongodb` as the shared backend database server
- `patient-records-service` for patient demographics, allergies, and clinical history
- `physicians-service` for doctor directory and availability
- `appointments-service` for appointment scheduling and lifecycle updates
- `waittime-service` for queue management and estimated wait times
- `admission-service` for admissions, room assignment, and discharge workflows
- `billing-service` for invoices and charge totals
- `fake-payment-gateway` for simulated payment methods and charge/refund testing
- `payments-service` for invoice payment orchestration
- `notifications-service` for email, SMS, and in-app notification logs
- `administration-service` for staff, roles, departments, and access metadata

## Tech Stack

- Node.js 20
- Express
- MongoDB 7
- Mongoose
- Docker Compose

## Quick Start

1. Copy `.env.example` to `.env` if you want to override the default MongoDB credentials.
2. Start the platform:

```bash
docker compose up --build
```

3. Open the API gateway:

- Root: `http://localhost:8080/`
- Health: `http://localhost:8080/health`

## Service Ports

- Gateway: `8080`
- Patient Records: `3001`
- Physicians: `3002`
- Appointments: `3003`
- Waittime: `3004`
- Admission: `3005`
- Billing: `3006`
- Fake Payment Gateway: `3007`
- Payments: `3008`
- Notifications: `3009`
- Administration: `3010`
- MongoDB: `27017`

## Gateway Routes

Each microservice is available behind the gateway:

- `/api/patient-records`
- `/api/physicians`
- `/api/appointments`
- `/api/waittime`
- `/api/admission`
- `/api/billing`
- `/api/fake-payment-gateway`
- `/api/payments`
- `/api/notifications`
- `/api/administration`

## Example Requests

Create a patient:

```bash
curl -X POST http://localhost:8080/api/patient-records/patients \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Marie",
    "lastName": "Jean",
    "dateOfBirth": "1991-02-14",
    "gender": "female",
    "phone": "+50937000000",
    "email": "marie.jean@example.com",
    "insuranceProvider": "SolidCare",
    "bloodType": "O+"
  }'
```

Create an appointment:

```bash
curl -X POST http://localhost:8080/api/appointments/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "replace-with-patient-mongo-id",
    "physicianId": "replace-with-physician-mongo-id",
    "scheduledAt": "2026-05-15T09:00:00.000Z",
    "reason": "Routine consultation",
    "channel": "in-person"
  }'
```

Create an invoice:

```bash
curl -X POST http://localhost:8080/api/billing/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "replace-with-patient-mongo-id",
    "items": [
      { "description": "Consultation", "quantity": 1, "unitPrice": 50 },
      { "description": "Lab Work", "quantity": 1, "unitPrice": 35 }
    ],
    "taxRate": 0.1
  }'
```

Process a payment:

```bash
curl -X POST http://localhost:8080/api/payments/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "replace-with-invoice-mongo-id",
    "patientId": "replace-with-patient-mongo-id",
    "amount": 93.5,
    "paymentMethod": {
      "methodType": "card",
      "provider": "Visa",
      "holderName": "Marie Jean",
      "cardNumber": "4111111111111111"
    }
  }'
```

## Core Endpoint Coverage

- Patient records: CRUD, search, allergy append, medical history append, summary
- Physicians: CRUD, specialty list, department search, utilization summary
- Appointments: CRUD, calendar-by-day, confirm, cancel, reschedule
- Waittime: CRUD, department estimates, queue advancement
- Admission: CRUD, active admissions, discharge flow
- Billing: CRUD, status filtering, total recalculation, mark paid
- Fake payment gateway: CRUD, payment method catalog, charge, refund
- Payments: CRUD, process payment, refund
- Notifications: CRUD, send, mark delivered, status filtering
- Administration: CRUD, role list, department summary, login timestamp

## Notes

- Each microservice has its own MongoDB database on the shared MongoDB server.
- Notifications are simulated and persisted rather than sent to real providers.
- The fake payment gateway is intentionally deterministic so success and failure cases are easy to test.
