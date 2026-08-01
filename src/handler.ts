// handler.ts

import {
  EC2Client,
  DeleteVolumeCommand
} from '@aws-sdk/client-ec2'

import type {
  APIGatewayProxyHandler
} from 'aws-lambda'


const ec2 = new EC2Client({ region: process.env.AWS_REGION })

export const handler: APIGatewayProxyHandler = async (
  event
) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    const { volumeId } = body

    if (!volumeId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'volumeId is required'
        })
      }
    }

    await ec2.send(
      new DeleteVolumeCommand({
        VolumeId: volumeId
      })
    )

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        volumeId
      })
    }
  } catch (err) {
    console.error('Error in deleteEbsVolumeLambda:', err)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error in deleteEbsVolumeLambda' })
    }
  }
}