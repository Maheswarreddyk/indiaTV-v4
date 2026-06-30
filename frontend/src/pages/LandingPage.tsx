import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { LoadingScreen } from '../components/LoadingScreen.js';

export function LandingPage() {
  const navigate = useNavigate();
  const { stats, isLoading, startSession } = useSession();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const handleStartChat = async () => {
    setStarting(true);
    try {
      await startSession();
      navigate('/chat');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to start session');
    } finally {
      setStarting(false);
    }
  };

  if (starting) {
    return <LoadingScreen message="Setting up your session..." />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <section className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm text-accent-light mb-8">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Anonymous · No Login · Free
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
              Meet Someone New
            </span>
            <br />
            <span className="bg-gradient-to-r from-accent via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Every Click
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10">
            IndiaTV connects you with random people around the world through anonymous video chat.
            No accounts, no emails — just click Start and begin chatting.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={handleStartChat}
              disabled={isLoading}
              className="btn-primary text-lg px-10 py-4"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Start Chat
            </button>
          </div>

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
              {[
                { label: 'Online Now', value: stats.onlineNow },
                { label: 'Active Users', value: stats.activeUsers },
                { label: 'Waiting', value: stats.waitingUsers },
                { label: 'Matches Today', value: stats.matchesToday },
              ].map((stat) => (
                <div key={stat.label} className="glass-card py-4 px-3">
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-white/50 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-white/5 py-16 px-4">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: '🔒',
              title: '100% Anonymous',
              desc: 'No login, no signup, no personal data required. Your privacy comes first.',
            },
            {
              icon: '⚡',
              title: 'Instant Matching',
              desc: 'Get paired with a random stranger in seconds. Press Next anytime for a new partner.',
            },
            {
              icon: '🛡️',
              title: 'Safe & Reportable',
              desc: 'Report inappropriate behavior instantly. We take community safety seriously.',
            },
          ].map((feature) => (
            <div key={feature.title} className="glass-card text-center hover:bg-white/[0.07] transition-colors">
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-white/50">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
