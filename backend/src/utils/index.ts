export function parseUserAgent(userAgent: string): {
  browser: string;
  device: string;
  platform: string;
} {
  let browser = 'Unknown';
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Safari')) browser = 'Safari';

  let device = 'Desktop';
  if (/Mobi|Android/i.test(userAgent)) device = 'Mobile';
  else if (/Tablet|iPad/i.test(userAgent)) device = 'Tablet';

  return { browser, device, platform: 'Unknown' };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
