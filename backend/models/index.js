"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Sequelize, DataTypes } = require("sequelize");

const passwordFile = process.env.DB_PASSWORD_FILE;
if (!passwordFile) {
  throw new Error("DB_PASSWORD_FILE is required");
}

const password = fs.readFileSync(passwordFile, "utf8").trim();
if (!password) {
  throw new Error("Database password file is empty");
}

const sslMode = process.env.DB_SSL;
if (!["true", "false"].includes(sslMode)) {
  throw new Error("DB_SSL must explicitly be true or false");
}

const dialectOptions = { connectTimeout: 4000 };
if (sslMode === "true") {
  dialectOptions.ssl = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA_FILE) {
    dialectOptions.ssl.ca = fs.readFileSync(
      process.env.DB_SSL_CA_FILE, "utf8"
    );
  }
}

const sequelize = new Sequelize(
  process.env.DB_NAME || "bookstore",
  process.env.DB_USER || "epicbook",
  password,
  {
    host: process.env.DB_HOST || "database",
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    dialectOptions,
    logging: false,
    pool: { max: 5, min: 0, acquire: 4000, idle: 10000 },
    retry: { max: 0 }
  }
);

const db = {};
for (const file of ["author.js", "book.js", "cart.js", "checkout.js"]) {
  const model = require(path.join(__dirname, file))(sequelize, DataTypes);
  db[model.name] = model;
}
for (const model of Object.values(db)) {
  if (model.associate) model.associate(db);
}

db.sequelize = sequelize;
module.exports = db;
