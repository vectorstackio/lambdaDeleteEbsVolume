import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'

const { send, command } = vi.hoisted(() => ({
  send: vi.fn(),
  command: vi.fn()
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class {
    send = send
  },
  DeleteVolumeCommand: class {
    constructor(input: unknown) {
      command(input)
    }
  }
}))

import { handler } from '../src/handler'

const invoke = (body: unknown) => handler(
  { body } as APIGatewayProxyEvent,
  {} as Context,
  vi.fn()
)

describe('delete EBS volume handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    send.mockReset().mockResolvedValue({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('deletes a volume from a JSON request body', async () => {
    const result = await invoke(JSON.stringify({ volumeId: 'vol-123' }))
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ success: true, volumeId: 'vol-123' }) })
    expect(command).toHaveBeenCalledExactlyOnceWith({ VolumeId: 'vol-123' })
    expect(send).toHaveBeenCalledOnce()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('accepts an already parsed body', async () => {
    const result = await invoke({ volumeId: 'vol-456' })
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ success: true, volumeId: 'vol-456' }) })
    expect(command).toHaveBeenCalledExactlyOnceWith({ VolumeId: 'vol-456' })
  })

  it.each([{}, { volumeId: '' }, { volumeId: null }, { volumeId: false }, { volumeId: 0 }])(
    'rejects a missing or falsy volume ID: %j', async body => {
      expect(await invoke(JSON.stringify(body))).toEqual({
        statusCode: 400,
        body: JSON.stringify({ error: 'volumeId is required' })
      })
      expect(send).not.toHaveBeenCalled()
      expect(command).not.toHaveBeenCalled()
    }
  )

  it.each(['{', '', 'null'])('handles an unusable JSON body: %s', async body => {
    expect(await invoke(body)).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error in deleteEbsVolumeLambda' })
    })
    expect(send).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('handles a null body', async () => {
    expect(await invoke(null)).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error in deleteEbsVolumeLambda' })
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns a generic error if deletion fails', async () => {
    const error = new Error('EC2 unavailable')
    send.mockRejectedValueOnce(error)
    expect(await invoke('{"volumeId":"vol-123"}')).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error in deleteEbsVolumeLambda' })
    })
    expect(send).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Error in deleteEbsVolumeLambda')
  })

  it('does not log request fields on success or validation failure', async () => {
    const secret = 'secret-access-token'
    await invoke(JSON.stringify({ volumeId: 'vol-123', token: secret }))
    await invoke(JSON.stringify({ token: secret }))
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret)
  })

  it('does not log sensitive information contained in an AWS error', async () => {
    const secret = 'secret-access-token'
    send.mockRejectedValueOnce(new Error(secret))
    await invoke('{"volumeId":"vol-123"}')
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Error in deleteEbsVolumeLambda')
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join(' ')).not.toContain(secret)
  })
})
