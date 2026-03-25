import { useState, useEffect } from 'react';
import { useInsightsStatus } from '@/api/hooks';
import { generateInsights, getInsightsReportUrl } from '@/api/client';
import { AlertTriangle, Sparkles, Loader2, ExternalLink, Clock } from 'lucide-react';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function InsightsPage() {
  const { data: status, isLoading } = useInsightsStatus();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      await generateInsights();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setGenerating(false);
    }
  };

  // Stop local generating state when backend finishes (success or failure)
  const isGenerating = generating || (status?.generating ?? false);
  useEffect(() => {
    if (generating && status && !status.generating) {
      setGenerating(false);
      if (status.lastError) {
        setError(status.lastError);
      } else {
        setError(null);
        if (status.reportExists) {
          setIframeKey(k => k + 1);
        }
      }
    }
    // Clear stale error when backend reports no error
    if (!generating && !isGenerating && status && !status.lastError && error) {
      setError(null);
    }
  }, [generating, status]);

  if (isLoading) {
    return <div className="text-text2 text-sm py-8">Loading...</div>;
  }

  const notAvailable = status && !status.available;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text">Insights</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow/15 text-yellow border border-yellow/30">
            Experimental
          </span>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-yellow flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-text mb-1">
              Generate a comprehensive usage insights report powered by Claude Code's <code className="text-xs bg-surface2 px-1 py-0.5 rounded">/insights</code> command.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-text2">
              <AlertTriangle className="w-3 h-3 text-yellow" />
              <span>This will consume tokens from your Claude plan. Generation typically takes 30–60 seconds.</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-text2 mt-1">
              <span>Requires Claude Code CLI installed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Not available */}
      {notAvailable && (
        <div className="bg-surface border border-red/30 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{status.reason}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      {status?.available && (
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Insights
              </>
            )}
          </button>

          {status.reportExists && status.lastModified && (
            <div className="flex items-center gap-1.5 text-xs text-text2">
              <Clock className="w-3.5 h-3.5" />
              <span>Last generated {timeAgo(status.lastModified)}</span>
            </div>
          )}

          {status.reportExists && (
            <a
              href={getInsightsReportUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
          )}
        </div>
      )}

      {(error || (!isGenerating && status?.lastError)) && (
        <div className="bg-surface border border-red/30 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red font-medium mb-1">Generation failed</p>
              <p className="text-xs text-text2">{error || status?.lastError}</p>
              {status?.reportExists && (
                <p className="text-[11px] text-text2 mt-1">Showing the last successfully generated report below.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generating indicator */}
      {isGenerating && (
        <div className="bg-surface border border-border rounded-lg p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-text2">Generating insights report...</p>
          <p className="text-[11px] text-text2">This may take 30–60 seconds. Tokens are being consumed.</p>
        </div>
      )}

      {/* Report iframe — show even after errors so user sees last report */}
      {!isGenerating && status?.reportExists && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <iframe
            key={iframeKey}
            src={`${getInsightsReportUrl()}?t=${iframeKey}`}
            title="Claude Code Insights Report"
            className="w-full border-0"
            style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
          />
        </div>
      )}

      {/* No report yet */}
      {!isGenerating && status?.available && !status.reportExists && (
        <div className="bg-surface border border-border rounded-lg p-12 flex flex-col items-center justify-center gap-3 text-center">
          <Sparkles className="w-10 h-10 text-text2/30" />
          <p className="text-sm text-text2">No insights report yet</p>
          <p className="text-[11px] text-text2">Click "Generate Insights" to create your first report.</p>
        </div>
      )}
    </div>
  );
}
