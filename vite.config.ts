import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// LOCAL PREVIEW ONLY — not part of the SPFx build/bundle.
// Renders the DMS Portal React components with mock data so the UI can be
// previewed in a normal browser without a SharePoint tenant.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: false
  },
  // @fluentui/react is a large package with many sub-entries. Without this,
  // Vite discovers its modules incrementally and gets stuck in a
  // re-optimize/full-reload loop. Pre-bundle the exact entry points in one pass.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@fluentui/react/lib/Icon',
      '@fluentui/react/lib/Icons'
    ]
  }
});
