import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
      <div className="text-center animate-fade-in">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-transparent mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-white mb-3">Page Not Found</h2>
        <p className="text-white/50 mb-8 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link to="/" className="btn-primary">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
