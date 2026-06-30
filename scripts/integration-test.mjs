/**
 * IndiaTV Integration Test Suite
 * Run: node scripts/integration-test.mjs
 */
const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5000';

const results = [];

function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail });
  console.log(`✅ PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail });
  console.error(`❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function testHealth() {
  const res = await fetch(`${API_URL}/health`);
  const data = await res.json();
  if (res.ok && data.status === 'healthy' && data.database === 'connected') {
    pass('GET /health', `status=${data.status}, database=${data.database}`);
  } else {
    fail('GET /health', JSON.stringify(data));
  }
}

async function testStats() {
  const res = await fetch(`${API_URL}/stats`);
  const data = await res.json();
  if (res.ok && data.success && typeof data.data.activeUsers === 'number') {
    pass('GET /stats', `online=${data.data.onlineNow}, waiting=${data.data.waitingUsers}`);
  } else {
    fail('GET /stats', JSON.stringify(data));
  }
}

async function testStartSession() {
  const res = await fetch(`${API_URL}/start-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browser: 'Test', device: 'Desktop', platform: 'Test' }),
  });
  const data = await res.json();
  if (res.status === 201 && data.data?.sessionId && data.data?.sessionToken) {
    pass('POST /start-session', `sessionId=${data.data.sessionId.slice(0, 8)}...`);
    return data.data;
  }
  fail('POST /start-session', JSON.stringify(data));
  return null;
}

async function testReport(reporterId, reportedId) {
  const res = await fetch(`${API_URL}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reporterSessionId: reporterId,
      reportedSessionId: reportedId,
      reason: 'spam',
      notes: 'Integration test report',
    }),
  });
  const data = await res.json();
  if (res.status === 201 && data.success) {
    pass('POST /report');
  } else {
    fail('POST /report', JSON.stringify(data));
  }
}

async function testFeedback(sessionId) {
  const res = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, rating: 5, feedback: 'Great test' }),
  });
  const data = await res.json();
  if (res.status === 201 && data.success) {
    pass('POST /feedback');
  } else {
    fail('POST /feedback', JSON.stringify(data));
  }
}

async function testEndSession(sessionId) {
  const res = await fetch(`${API_URL}/end-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const data = await res.json();
  if (res.ok && data.success) {
    pass('POST /end-session');
  } else {
    fail('POST /end-session', JSON.stringify(data));
  }
}

async function testSocketMatching() {
  const { io } = await import('socket.io-client');

  const sessionA = await fetch(`${API_URL}/start-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browser: 'TestA' }),
  }).then((r) => r.json());

  const sessionB = await fetch(`${API_URL}/start-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browser: 'TestB' }),
  }).then((r) => r.json());

  if (!sessionA.data || !sessionB.data) {
    fail('Socket matching setup', 'Failed to create sessions');
    return;
  }

  return new Promise((resolve) => {
    let matchedA = false;
    let matchedB = false;
    const timeout = setTimeout(() => {
      socketA?.disconnect();
      socketB?.disconnect();
      if (matchedA && matchedB) {
        pass('Socket.io matching', 'Both users matched');
      } else {
        fail('Socket.io matching', `A=${matchedA}, B=${matchedB}`);
      }
      resolve();
    }, 8000);

    const socketA = io(SOCKET_URL, {
      auth: { sessionId: sessionA.data.sessionId, sessionToken: sessionA.data.sessionToken },
      transports: ['websocket'],
    });

    const socketB = io(SOCKET_URL, {
      auth: { sessionId: sessionB.data.sessionId, sessionToken: sessionB.data.sessionToken },
      transports: ['websocket'],
    });

    socketA.on('matched', () => { matchedA = true; });
    socketB.on('matched', () => { matchedB = true; });

    socketA.on('connect', () => socketA.emit('join_queue'));
    socketB.on('connect', () => setTimeout(() => socketB.emit('join_queue'), 500));

    socketA.on('connect_error', (err) => {
      fail('Socket.io connection A', err.message);
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function testFrontendProxy() {
  try {
    const res = await fetch('http://localhost:5173/api/health');
    const data = await res.json();
    if (data.status === 'healthy') {
      pass('Frontend → Backend proxy', '/api/health via Vite proxy');
    } else {
      fail('Frontend → Backend proxy', JSON.stringify(data));
    }
  } catch (err) {
    fail('Frontend → Backend proxy', err.message);
  }
}

async function run() {
  console.log('\n========================================');
  console.log('  IndiaTV Integration Test Suite');
  console.log('========================================\n');

  await testHealth();
  await testStats();

  const session = await testStartSession();
  if (session) {
    const session2 = await fetch(`${API_URL}/start-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser: 'Test2' }),
    }).then((r) => r.json());

    if (session2.data) {
      await testReport(session.sessionId, session2.data.sessionId);
    }
    await testFeedback(session.sessionId);
    await testEndSession(session.sessionId);
    if (session2.data) {
      await fetch(`${API_URL}/end-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session2.data.sessionId }),
      });
    }
  }

  await testSocketMatching();
  await testFrontendProxy();

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
