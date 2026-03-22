import { useSession, useTranscript } from '@/api/hooks';
import { useLocation } from 'wouter';
import { formatCost, formatTokens, formatDuration, timeAgo } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
import { BarChart, ProgressBar } from '@/components/Chart';

const TOOL_TO_SKILL: Record<string, { skill: string; icon: string }> = {
  Write: { skill: 'Code Writing', icon: '✏️' },
  Edit: { skill: 'Code Editing', icon: '✏️' },
  MultiEdit: { skill: 'Code Editing', icon: '✏️' },
  Read: { skill: 'Code Reading', icon: '📖' },
  Bash: { skill: 'Command Execution', icon: '⚡' },
  Search: { skill: 'Code Search', icon: '🔍' },
  Grep: { skill: 'Code Search', icon: '🔍' },
  Glob: { skill: 'Code Search', icon: '🔍' },
  ListDir: { skill: 'File Navigation', icon: '📁' },
  WebSearch: { skill: 'Web Research', icon: '🌐' },
  WebFetch: { skill: 'Web Research', icon: '🌐' },
  TodoRead: { skill: 'Task Management', icon: '📋' },
  TodoWrite: { skill: 'Task Management', icon: '📋' },
  Notebook: { skill: 'Notebook Editing', icon: '📓' },
  NotebookEdit: { skill: 'Notebook Editing', icon: '📓' },
};

function deriveSkills(toolsUsed: Record<string, number>): { skill: string; icon: string; tools: string[]; calls: number }[] {
  const skillMap = new Map<string, { icon: string; tools: Set<string>; calls: number }>();

  for (const [tool, count] of Object.entries(toolsUsed)) {
    const mapped = TOOL_TO_SKILL[tool];
    const skill = mapped?.skill ?? tool;
    const icon = mapped?.icon ?? '🔧';

    if (!skillMap.has(skill)) skillMap.set(skill, { icon, tools: new Set(), calls: 0 });
    const entry = skillMap.get(skill)!;
    entry.tools.add(tool);
    entry.calls += count;
  }

  return [...skillMap.entries()]
    .map(([skill, { icon, tools, calls }]) => ({ skill, icon, tools: [...tools], calls }))
    .sort((a, b) => b.calls - a.calls);
}

export function SessionDetail({ id }: { id: string }) {
  const { data, isLoading } = useSession(id);
  const { data: transcript } = useTranscript(id);
  const [, setLocation] = useLocation();

  if (isLoading || !data) {
    return <div className="text-text2 text-sm py-8">Loading session...</div>;
  }

  const { session: s, events, quality: q } = data;
  const totalTokens = s.total_input_tokens + s.total_output_tokens;
  const isActive = !s.ended_at;

  // Tool usage from session
  const toolData = Object.entries(s.tools_used ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  // Build event timeline
  const toolEvents = events.filter(e => e.event === 'PostToolUse');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setLocation('/sessions')}
          className="text-xs text-accent hover:underline"
        >
          ← Sessions
        </button>
        <span className="text-text2">/</span>
        <h2 className="text-lg font-semibold text-text font-mono">{id.slice(0, 12)}…</h2>
        {isActive && (
          <span className="inline-flex items-center gap-1 text-xs text-green">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            Active
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Model" value={s.model_name || s.model_id || '—'} />
        <StatCard label="Cost" value={formatCost(s.total_cost_usd)} accent="yellow" />
        <StatCard
          label="Tokens"
          value={formatTokens(totalTokens)}
          sub={`${formatTokens(s.total_input_tokens)} in / ${formatTokens(s.total_output_tokens)} out`}
          accent="cyan"
        />
        <StatCard label="Duration" value={formatDuration(s.total_duration_ms)} />
        <StatCard label="API Time" value={formatDuration(s.total_api_duration_ms)} />
        <StatCard
          label="Lines"
          value={`+${s.total_lines_added} / -${s.total_lines_removed}`}
          accent="green"
        />
      </div>

      {/* Agent Info + Workspace */}
      {(s.agent_id || s.cwd) && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-medium text-text2 mb-3">Agent &amp; Environment</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {s.agent_id && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Agent ID</div>
                <div className="text-purple font-medium">{s.agent_id}</div>
              </div>
            )}
            {s.agent_type && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Agent Type</div>
                <div className="text-text">{s.agent_type}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Workspace</div>
              <div className="text-text font-mono truncate" title={s.cwd}>{s.cwd || '—'}</div>
            </div>
            {s.version && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Claude Code</div>
                <div className="text-text">v{s.version}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quality Signals */}
      {q && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6">
          <h3 className="text-xs font-medium text-text2 mb-3">Quality Signals</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Status</div>
              <span className={`text-xs font-medium ${
                q.completionStatus === 'success' ? 'text-green' :
                q.completionStatus === 'failure' ? 'text-red' : 'text-text2'
              }`}>
                {q.completionStatus === 'success' ? '✓ Completed' :
                 q.completionStatus === 'failure' ? '✗ Failed' : '— In progress'}
              </span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Retry Rate</div>
              <span className={`text-xs font-medium tabular-nums ${
                q.retryRate > 0.3 ? 'text-red' : q.retryRate > 0 ? 'text-yellow' : 'text-green'
              }`}>
                {(q.retryRate * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-text2 ml-1">
                ({q.stopFailures}/{q.totalStops} stops)
              </span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Tool Errors</div>
              <span className={`text-xs font-medium tabular-nums ${
                q.toolErrorRate > 0.2 ? 'text-red' : q.toolErrorRate > 0 ? 'text-yellow' : 'text-green'
              }`}>
                {(q.toolErrorRate * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-text2 ml-1">
                ({q.toolErrors}/{q.toolCalls} calls)
              </span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Efficiency</div>
              {q.costPerLine != null ? (
                <span className="text-xs font-medium text-yellow tabular-nums">
                  {(q.costPerLine * 100).toFixed(2)}¢/line
                </span>
              ) : (
                <span className="text-xs text-text2">No lines changed</span>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Token Efficiency</div>
              {q.tokensPerLine != null ? (
                <span className="text-xs font-medium text-cyan tabular-nums">
                  {q.tokensPerLine.toFixed(0)} tok/line
                </span>
              ) : (
                <span className="text-xs text-text2">—</span>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text2 mb-0.5">Turns</div>
              <span className="text-xs font-medium text-accent tabular-nums">
                {q.turnCount || '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Context window + Cache */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Context Window</h3>
          <ProgressBar
            value={s.used_percentage}
            max={100}
            label={`${s.used_percentage}%`}
            color="var(--color-accent)"
          />
          <div className="mt-2 text-[10px] text-text2">
            {formatTokens(s.total_input_tokens + s.total_output_tokens)} / {formatTokens(s.context_window_size)} tokens
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Cache Stats</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text2">Cache reads</span>
              <span className="text-green tabular-nums">{formatTokens(s.cache_read_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text2">Cache creation</span>
              <span className="text-yellow tabular-nums">{formatTokens(s.cache_creation_tokens)}</span>
            </div>
            {(s.cache_read_tokens + s.cache_creation_tokens) > 0 && (
              <div className="flex justify-between pt-1 border-t border-border/50">
                <span className="text-text2">Cache hit rate</span>
                <span className="text-accent tabular-nums">
                  {Math.round((s.cache_read_tokens / (s.cache_read_tokens + s.cache_creation_tokens + 1)) * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tool usage + Skills */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">
            Tool Usage ({Object.values(s.tools_used ?? {}).reduce((a, b) => a + b, 0)} calls)
          </h3>
          {toolData.length ? (
            <BarChart data={toolData} height={140} barColor="var(--color-purple)" />
          ) : (
            <div className="text-text2 text-xs py-4">No tool calls recorded</div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-text2 mb-3">Skills Used</h3>
          {(() => {
            const skills = deriveSkills(s.tools_used ?? {});
            return skills.length ? (
              <div className="space-y-2">
                {skills.map(sk => (
                  <div key={sk.skill} className="flex items-center gap-2 px-2 py-1.5 bg-surface2 rounded-lg">
                    <span className="text-sm">{sk.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text">{sk.skill}</div>
                      <div className="text-[10px] text-text2 truncate">{sk.tools.join(', ')} · {sk.calls} call{sk.calls !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-text2 text-xs py-4">No skills detected</div>
            );
          })()}
        </div>
      </div>

      {/* Files Changed */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <h3 className="text-xs font-medium text-text2 mb-3">
          Files Changed ({s.files_changed?.length ?? 0})
        </h3>
        {s.files_changed?.length ? (
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {s.files_changed.map((f, i) => (
              <div key={i} className="text-[11px] font-mono text-text truncate px-1 py-0.5 hover:bg-surface2 rounded">
                {f}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text2 text-xs py-4">No file changes recorded</div>
        )}
      </div>

      {/* Event timeline */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-xs font-medium text-text2 mb-3">
          Activity Timeline ({events.length} events)
        </h3>
        {events.length ? (
          <div className="max-h-[400px] overflow-y-auto space-y-0.5">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1 hover:bg-surface2 rounded text-[11px]">
                <span className="text-text2 shrink-0 w-14 tabular-nums">
                  {timeAgo(e.timestamp)}
                </span>
                <EventBadge event={e.event} />
                <span className="text-text truncate flex-1">
                  {e.tool_name && <span className="text-purple font-medium">{e.tool_name}</span>}
                  {e.tool_input && e.tool_name === 'Bash' && (
                    <span className="text-text2 ml-1 font-mono">
                      {String(e.tool_input.command ?? '').slice(0, 80)}
                    </span>
                  )}
                  {e.tool_input && (e.tool_name === 'Write' || e.tool_name === 'Edit') && (
                    <span className="text-text2 ml-1 font-mono">
                      {String(e.tool_input.file_path ?? '')}
                    </span>
                  )}
                  {e.event === 'SessionStart' && (
                    <span className="text-text2">model={e.model} source={e.source}</span>
                  )}
                  {e.event === 'Stop' && (
                    <span className="text-text2">
                      {e.last_assistant_message?.slice(0, 100)}
                    </span>
                  )}
                  {e.event === 'StopFailure' && (
                    <span className="text-red">{e.error}: {e.error_details}</span>
                  )}
                  {e.event === 'SessionEnd' && (
                    <span className="text-text2">reason={e.reason}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text2 text-xs py-4 text-center">
            No events recorded. Hook data arrives via PostToolUse, Stop, etc.
          </div>
        )}
      </div>

      {/* Summary */}
      {s.last_assistant_message && (
        <div className="bg-surface border border-border rounded-lg p-4 mt-4">
          <h3 className="text-xs font-medium text-text2 mb-2">Session Summary</h3>
          <p className="text-xs text-text whitespace-pre-wrap leading-relaxed">
            {s.last_assistant_message}
          </p>
        </div>
      )}

      {/* Conversation */}
      {transcript && transcript.messages.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4 mt-6">
          <h3 className="text-xs font-medium text-text2 mb-3">Conversation</h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {transcript.messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? '' : 'pl-4'}`}>
                <span className={`text-[10px] font-medium shrink-0 mt-0.5 w-14 ${
                  m.role === 'user' ? 'text-accent' : 'text-purple'
                }`}>
                  {m.role === 'user' ? 'You' : 'Claude'}
                </span>
                <div className={`text-xs leading-relaxed flex-1 ${
                  m.role === 'user'
                    ? 'text-text bg-surface2 rounded-lg px-3 py-2'
                    : 'text-text2'
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.timestamp && (
                    <span className="text-[9px] text-text2/50 mt-1 block">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="mt-4 text-[10px] text-text2 space-y-0.5">
        <div>Session ID: <span className="font-mono">{s.session_id}</span></div>
        <div>Working directory: <span className="font-mono">{s.cwd}</span></div>
        {s.version && <div>Claude Code version: {s.version}</div>}
        <div>Started: {new Date(s.started_at).toLocaleString()}</div>
        {s.ended_at && <div>Ended: {new Date(s.ended_at).toLocaleString()}</div>}
      </div>
    </div>
  );
}

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    SessionStart: 'text-green bg-green/10',
    SessionEnd: 'text-red bg-red/10',
    PostToolUse: 'text-purple bg-purple/10',
    Stop: 'text-yellow bg-yellow/10',
    StopFailure: 'text-red bg-red/10',
  };
  const cls = colors[event] ?? 'text-text2 bg-surface2';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${cls}`}>
      {event}
    </span>
  );
}
