'use client';
import dynamic from 'next/dynamic';

const FullThrottleInspection = dynamic(() => import('../../full-throttle-inspection-cloud'), {
  ssr: false,
});

export default function InspectPage() {
  return <FullThrottleInspection />;
}
