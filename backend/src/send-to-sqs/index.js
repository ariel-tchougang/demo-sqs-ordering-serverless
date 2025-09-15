import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { segments, queueType, uuid } = JSON.parse(event.body);
    
    const queueUrl = queueType === 'FIFO' 
      ? process.env.FIFO_QUEUE_URL 
      : process.env.STANDARD_QUEUE_URL;

    const params = {
      MessageBody: JSON.stringify(segments),
      QueueUrl: queueUrl
    };

    if (queueType === 'FIFO') {
      params.MessageGroupId = uuid;
      params.MessageDeduplicationId = `${uuid}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    const command = new SendMessageCommand(params);
    const result = await sqsClient.send(command);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        messageId: result.MessageId 
      })
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};