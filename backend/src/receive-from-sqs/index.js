import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

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
    const { queueType } = JSON.parse(event.body);
    
    const queueUrl = queueType === 'FIFO' 
      ? process.env.FIFO_QUEUE_URL 
      : process.env.STANDARD_QUEUE_URL;

    const receiveParams = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 1
    };

    const receiveCommand = new ReceiveMessageCommand(receiveParams);
    const data = await sqsClient.send(receiveCommand);

    // Delete messages after receiving
    if (data.Messages && data.Messages.length > 0) {
      for (const message of data.Messages) {
        const deleteParams = {
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle
        };
        const deleteCommand = new DeleteMessageCommand(deleteParams);
        await sqsClient.send(deleteCommand);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error receiving messages:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};