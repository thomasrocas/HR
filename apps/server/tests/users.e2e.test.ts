import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("express", () => {
  const actual = jest.requireActual("express");

  const express = (...args: unknown[]) => {
    const app = actual(...args);
    app.listen = (port?: unknown, callback?: () => void) => {
      if (typeof callback === "function") {
        callback();
      }

      const resolvedPort = typeof port === "number" ? port : 0;

      return {
        close: () => undefined,
        address: () => ({ port: resolvedPort }),
      } as unknown as import("http").Server;
    };

    return app;
  };

  return Object.assign(express, actual);
});

class FakeClient {
  constructor(private readonly pool: FakePool) {}

  query(sql: string, params?: unknown[]) {
    return this.pool.query(sql, params);
  }

  release() {
    return undefined;
  }
}

class FakePool {
  public readonly queries: Array<{ sql: string; params?: unknown[] }> = [];

  async query(sql: string, params?: unknown[]) {
    this.queries.push({ sql, params });
    if (typeof sql === "string" && sql.includes("SELECT 1")) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  async connect() {
    return new FakeClient(this);
  }

  on() {
    return this;
  }

  async end() {
    return undefined;
  }
}

jest.mock("pg", () => ({
  Pool: FakePool,
}));

describe("server bootstrap", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.PORT = "0";
    process.env.SESSION_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/test";

    const mod = await import("../src/index");
    app = mod.app;
  });

  it("responds to /healthz", async () => {
    const response = await request(app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, env: "test" });
  });

  it("responds to legacy /health", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
