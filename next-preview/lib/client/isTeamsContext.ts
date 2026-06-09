// Best-effort phát hiện app đang chạy trong Microsoft Teams (client-side).
// KHÔNG thêm dependency mới. Nếu không chắc → trả false (mặc định hiện logout trên web).
// Tín hiệu: iframe (self!==top) · UA chứa Teams · query param deep-link Teams.

export function isTeamsContext(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const inIframe = window.self !== window.top;
    const ua = (navigator.userAgent || '').toLowerCase();
    const uaTeams = ua.includes('teams/') || ua.includes('microsoftteams');
    const url = new URL(window.location.href);
    const hasParam =
      url.searchParams.has('inTeams') ||
      url.searchParams.has('frameContext') ||
      url.searchParams.get('source') === 'teams';
    return inIframe || uaTeams || hasParam;
  } catch {
    return false;
  }
}
