const crypto = require("crypto");

function createReference(prefix) {
  const dateToken = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().split("-")[0].toUpperCase();
  return `${prefix}-${dateToken}-${suffix}`;
}

module.exports = {
  createReference,
};
