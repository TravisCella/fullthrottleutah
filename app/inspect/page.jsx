'use client';

import dynamic from 'next/dynamic';

const FullThrottleInspection = dynamic(
  () => import('../../full-throttle-inspection-cloud.jsx'),
  { ssr: false, loading: () => <div>Loading inspection app...</div> }
);

export default function InspectPage() {
  return (
    <div style={{ width: '100%', minHeight: '100vh' }}>
      <FullThrottleInspection />
    </div>
  );
}
