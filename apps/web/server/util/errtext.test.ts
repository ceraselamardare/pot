// errText (privacy audit 2026-11-02): a failed query's values never reach a log line.
import { DrizzleQueryError } from "drizzle-orm/errors"
import { describe, expect, it } from "vitest"
import { errText } from "./errtext"

describe("errText", () => {
  it("drops a failed query's values, keeps the SQL and the cause", () => {
    const cause = Object.assign(new Error('new row for relation "request_comment" violates check constraint "request_comment_body_ck"'), { code: "23514" })
    const e = new DrizzleQueryError('insert into "request_comment" ("pot_id", "body") values ($1, $2)', ["lisbon-trip.pots.test", "Meet at Maya's, the code is 4471"], cause)
    expect(String(e)).toContain("the code is 4471") // what used to be logged
    const line = errText(e)
    expect(line).not.toContain("4471")
    expect(line).not.toContain("lisbon-trip.pots.test")
    expect(line).toContain('insert into "request_comment"')
    expect(line).toContain("2 values hidden")
    expect(line).toContain("db 23514: new row for relation")
  })

  it("a Postgres input error keeps its code but not the quoted value", () => {
    const e = Object.assign(new Error('invalid input syntax for type json: "{merchant: Café du Col"'), { code: "22P02" })
    expect(errText(e)).toBe('db 22P02: invalid input syntax for type json: "…"')
  })

  it("anything else is String(e), cut at max", () => {
    expect(errText(new Error("rpc timeout"))).toBe("Error: rpc timeout")
    expect(errText("x".repeat(500), 10)).toBe("x".repeat(10))
    expect(errText(undefined)).toBe("undefined")
  })
})
