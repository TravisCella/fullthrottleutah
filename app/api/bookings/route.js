import { NextResponse } from 'next/server';
import { getBookedDates, getPremiumDates } from '../../../lib/sheets';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get('package') || '';
    const [bookedDates, premiumDates] = await Promise.all([
      getBookedDates(packageId),
      getPremiumDates(packageId),
    ]);
    return NextResponse.json({ bookedDates, premiumDates });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ bookedDates: [], premiumDates: [], error: error.message }, { status: 500 });
  }
}
