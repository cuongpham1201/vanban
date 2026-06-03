import PreviewClient from './PreviewClient';

// Trang gốc "/" = bản preview DMS Portal với MockDmsService.
// Tương đương preview/main.tsx (Vite): <DmsPortal dmsService={new MockDmsService()} ... />
export default function Page(): React.ReactElement {
  return <PreviewClient />;
}
