"use strict";

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const db = require("../models");

function log(event, fields = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "database-init",
    event,
    ...fields
  }));
}

async function main() {
  let connection;
  try {
    await db.sequelize.authenticate();
    await db.sequelize.sync();

    const config = db.sequelize.config;
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ...db.sequelize.options.dialectOptions,
      multipleStatements: true
    });

    await connection.beginTransaction();

    for (const [table, file] of [
      ["Author", "author_seed.sql"],
      ["Book", "books_seed.sql"]
    ]) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS count FROM \`${table}\``
      );

      if (Number(rows[0].count) !== 0) {
        log("seed_skipped", { table, reason: "already_has_data" });
        continue;
      }

      const sql = fs.readFileSync(
        path.join(__dirname, "../db", file), "utf8"
      ).replace(/^[ \t]*USE[ \t]+[^;\r\n]+;[^\r\n]*$/gmi, "");

      await connection.query(sql);
      log("seed_loaded", { table });
    }

    await connection.commit();
    log("initialisation_complete", {
      authors: await db.Author.count(),
      books: await db.Book.count()
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    log("initialisation_failed", {
      errorType: error.name,
      code: error.code
    });
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
    await db.sequelize.close();
  }
}

main();
