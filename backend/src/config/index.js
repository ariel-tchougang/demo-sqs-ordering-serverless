export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const config = {
    STANDARD_QUEUE_URL: process.env.STANDARD_QUEUE_URL,
    FIFO_QUEUE_URL: process.env.FIFO_QUEUE_URL,
    POLLING_INTERVAL: process.env.POLLING_INTERVAL,
    DELAY_BEFORE_CALLING_RECEIVE: process.env.DELAY_BEFORE_CALLING_RECEIVE,
    SEGMENT_SIZE: process.env.SEGMENT_SIZE,
    AWS_REGION: process.env.AWS_REGION
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(config)
  };
};