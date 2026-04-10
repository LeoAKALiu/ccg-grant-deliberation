import { describe, expect, it } from 'vitest'
import { parseDoctorArgs } from '../scripts/doctor.mjs'

describe('doctor cli args', () => {
  it('parses allow-blocked alongside other flags', () => {
    expect(parseDoctorArgs(['--allow-blocked', '--json'])).toEqual({
      allowBlocked: true,
      json: true,
      hook: false,
    })
    expect(parseDoctorArgs([])).toEqual({
      allowBlocked: false,
      json: false,
      hook: false,
    })
  })
})
