import { describe, expect, it } from 'vitest'
import { proposedEditSchema } from './schemas'

describe('model proposal contract', () => {
  const valid = {
    summary: 'Add lunch on Friday.',
    patches: [{
      op: 'add_block', client_ref: 'lunch-1', block: {
        title: 'Lunch', type: 'meal', day_date: '2026-08-07', start_time: '12:00',
        duration_min: 60, time_source: 'estimated', notes: null, is_locked: false,
        confirmation_ref: null, confidence: 0.8, idea_id: null,
      },
    }],
  }

  it('accepts a complete strict proposal', () => {
    expect(proposedEditSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects extra fields and missing operation fields', () => {
    expect(proposedEditSchema.safeParse({ ...valid, invented: true }).success).toBe(false)
    const incomplete = structuredClone(valid)
    delete (incomplete.patches[0].block as Partial<typeof incomplete.patches[0]['block']>).time_source
    expect(proposedEditSchema.safeParse(incomplete).success).toBe(false)
  })

  it('rejects model attempts to set trusted Google data', () => {
    const unsafe = structuredClone(valid) as typeof valid & { patches: Array<typeof valid.patches[0] & { block: typeof valid.patches[0]['block'] & { latitude: number } }> }
    unsafe.patches[0].block.latitude = -33.8
    expect(proposedEditSchema.safeParse(unsafe).success).toBe(false)
  })
})
