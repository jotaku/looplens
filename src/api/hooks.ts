import { useQuery } from '@tanstack/react-query';
import * as api from './client';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    refetchInterval: 5000,
  });
}

export function useSessions(page = 1, limit = 50) {
  return useQuery({
    queryKey: ['sessions', page, limit],
    queryFn: () => api.getSessions(page, limit),
    refetchInterval: 5000,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id),
    refetchInterval: 5000,
    enabled: !!id,
  });
}

export function useTranscript(sessionId: string) {
  return useQuery({
    queryKey: ['transcript', sessionId],
    queryFn: () => api.getTranscript(sessionId),
    refetchInterval: 10000,
    enabled: !!sessionId,
  });
}

export function useQuality() {
  return useQuery({
    queryKey: ['quality'],
    queryFn: () => api.getQuality(),
    refetchInterval: 10000,
  });
}

export function useCommits(page = 1, limit = 50) {
  return useQuery({
    queryKey: ['commits', page, limit],
    queryFn: () => api.getCommits(page, limit),
    refetchInterval: 10000,
  });
}

export function useInsightsStatus() {
  return useQuery({
    queryKey: ['insights-status'],
    queryFn: () => api.getInsightsStatus(),
    refetchInterval: 5000,
  });
}
