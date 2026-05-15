import { NextResponse } from 'next/server';
import { getBookedDates } from '../../../lib/sheets';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get('package') || '';
    const bookedDates = await getBookedDates(packageId);
    return NextResponse.json({ bookedDates });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ bookedDates: [], error: error.message }, { status: 500 });
  }
}
