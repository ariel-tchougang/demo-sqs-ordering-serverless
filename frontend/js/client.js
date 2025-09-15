// Client-side JavaScript for AWS SQS Ordering Demo - Serverless Version
let config;
let segments = [];
let intervalId = null;
let isDrawing = false;

// API Gateway endpoint - will be set after deployment
// const API_BASE_URL = 'http://localhost:3000'; //'API_GATEWAY_URL_PLACEHOLDER';
const API_BASE_URL = 'https://83hs4pxnd8.execute-api.eu-west-3.amazonaws.com/prod';

const queueTypeSelect = document.getElementById('queueType');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const clone = document.getElementById('clone');
const cloneCtx = clone.getContext('2d');
const startButton = document.getElementById('startBtn');
const clearButton = document.getElementById('clearBtn');
const colorPicker = document.getElementById('colorPicker');
const lineWidthInput = document.getElementById('lineWidth');
const statusElement = document.getElementById('status');
const statusTextElement = document.getElementById('statusText');

const fifoUUID = generateUUID();

let coord = { x: 0, y: 0 };

async function fetchServerConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    config = await response.json();
    console.log('Config loaded:', config);
  } catch (error) {
    console.error('Error loading config:', error);
    showStatus('Error loading configuration', 'error');
  }
}

async function init() {
  await fetchServerConfig();
  setupEventListeners();
  resizeCanvases();
}

function setupEventListeners() {
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('touchmove', handleTouchMove);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  startButton.addEventListener('click', startSendingDatapoints);
  clearButton.addEventListener('click', clear);
  
  window.addEventListener('resize', resizeCanvases);
}

function resizeCanvases() {
  const containerWidth = canvas.parentElement.clientWidth;
  const aspectRatio = 0.6;
  
  canvas.width = containerWidth;
  canvas.height = containerWidth * aspectRatio;
  clone.width = containerWidth;
  clone.height = containerWidth * aspectRatio;
  
  if (segments.length > 0) {
    redrawCanvas();
  }
}

function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  segments.forEach(segment => {
    drawLine(
      ctx, 
      segment.fromX1, 
      segment.fromY1, 
      segment.toX2, 
      segment.toY2, 
      segment.color || colorPicker.value, 
      segment.lineWidth || lineWidthInput.value
    );
  });
}

function handleTouchStart(event) {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    startDrawing({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  }
}

function handleTouchMove(event) {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    draw({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  }
}

function startDrawing(event) {
  isDrawing = true;
  updateCoordinates(event);
}

function stopDrawing() {
  isDrawing = false;
}

function updateCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  coord.x = event.clientX - rect.left;
  coord.y = event.clientY - rect.top;
}

function draw(event) {
  if (!isDrawing) return;
  
  const fromX1 = coord.x;
  const fromY1 = coord.y;
  
  updateCoordinates(event);
  
  const toX2 = coord.x;
  const toY2 = coord.y;
  
  segments.push({ 
    fromX1, 
    fromY1, 
    toX2, 
    toY2, 
    color: colorPicker.value,
    lineWidth: lineWidthInput.value
  });
  
  drawLine(ctx, fromX1, fromY1, toX2, toY2, colorPicker.value, lineWidthInput.value);
}

function drawLine(context, fromX1, fromY1, toX2, toY2, color = '#C0392B', lineWidth = 5) {
  context.beginPath();
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.strokeStyle = color;
  
  context.moveTo(fromX1, fromY1);
  context.lineTo(toX2, toY2);
  context.stroke();
}

async function startSendingDatapoints() {
  if (!config) {
    showStatus('Configuration not loaded yet', 'error');
    return;
  }
  
  if (segments.length === 0) {
    showStatus('Draw something first!', 'error');
    return;
  }
  
  startButton.disabled = true;
  queueTypeSelect.disabled = true;
  startButton.classList.add('opacity-50', 'cursor-not-allowed');
  queueTypeSelect.classList.add('opacity-50', 'cursor-not-allowed');
  
  cloneCtx.clearRect(0, 0, clone.width, clone.height);
  
  showStatus('Sending drawing data to SQS...');
  
  const queueType = queueTypeSelect.value;
  const uuid = queueType === 'FIFO' ? fifoUUID : null;
  
  const size = parseInt(config.SEGMENT_SIZE);
  for (let i = 0; i < segments.length; i += size) {
    const chunk = segments.slice(i, i + size);
    await sendSegmentToSQS(chunk, queueType, uuid);
  }
  
  showStatus(`Waiting ${config.DELAY_BEFORE_CALLING_RECEIVE/1000} seconds before receiving...`);
  await delay(config.DELAY_BEFORE_CALLING_RECEIVE);
  
  startReceivingDatapoints();
}

async function sendSegmentToSQS(segments, queueType, uuid) {
  try {
    const payload = { segments, queueType };
    if (uuid) payload.uuid = uuid;
    
    const response = await fetch(`${API_BASE_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending segments:', error);
    showStatus('Error sending data to SQS', 'error');
  }
}

function startReceivingDatapoints() {
  if (!config) {
    showStatus('Configuration not loaded yet', 'error');
    return;
  }
  
  const queueType = queueTypeSelect.value;
  
  showStatus('Receiving data from SQS...');
  
  intervalId = setInterval(
    () => readFromSegmentQueue(queueType), 
    config.POLLING_INTERVAL
  );
}

async function readFromSegmentQueue(queueType) {
  try {
    const response = await fetch(`${API_BASE_URL}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueType })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.Messages && data.Messages.length > 0) {
      for (const message of data.Messages) {
        const segments = JSON.parse(message.Body);
        
        for (const segment of segments) {
          drawLine(
            cloneCtx, 
            segment.fromX1, 
            segment.fromY1, 
            segment.toX2, 
            segment.toY2,
            segment.color,
            segment.lineWidth
          );
          
          await delay(10);
        }
      }
    } else if (!data.Messages || data.Messages.length === 0) {
      stopReceivingDatapoints();
      showStatus('Drawing complete!', 'success');
    }
  } catch (error) {
    console.error('Error receiving segments:', error);
    showStatus('Error receiving data from SQS', 'error');
  }
}

async function clear() {
  stopReceivingDatapoints();
  segments = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cloneCtx.clearRect(0, 0, clone.width, clone.height);
  hideStatus();
}

function stopReceivingDatapoints() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  startButton.disabled = false;
  queueTypeSelect.disabled = false;
  startButton.classList.remove('opacity-50', 'cursor-not-allowed');
  queueTypeSelect.classList.remove('opacity-50', 'cursor-not-allowed');
}

function showStatus(message, type = 'info') {
  statusElement.classList.remove('hidden');
  statusTextElement.textContent = message;
  
  if (type === 'error') {
    statusTextElement.classList.add('text-red-600');
    statusTextElement.classList.remove('text-gray-600', 'text-green-600');
  } else if (type === 'success') {
    statusTextElement.classList.add('text-green-600');
    statusTextElement.classList.remove('text-gray-600', 'text-red-600');
  } else {
    statusTextElement.classList.add('text-gray-600');
    statusTextElement.classList.remove('text-red-600', 'text-green-600');
  }
}

function hideStatus() {
  statusElement.classList.add('hidden');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateUUID() {
  const cryptoObj = window.crypto || window.msCrypto;
  const buffer = new Uint8Array(16);
  cryptoObj.getRandomValues(buffer);
  
  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  
  const hexValues = Array.from(buffer, byte => byte.toString(16).padStart(2, '0'));
  return [
    hexValues.slice(0, 4).join(''),
    hexValues.slice(4, 6).join(''),
    hexValues.slice(6, 8).join(''),
    hexValues.slice(8, 10).join(''),
    hexValues.slice(10).join('')
  ].join('-');
}

window.addEventListener('DOMContentLoaded', init);