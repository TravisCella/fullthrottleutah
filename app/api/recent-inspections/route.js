import { NextResponse } from 'next/server';
import { getRecentInspections } from '../../../lib/sheets';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    
    let inspections = await getRecentInspections(days);
    
    // Optional filter by search term (matches name, machine, or ID prefix)
    if (search) {
      inspections = inspections.filter(insp => {
        const hay = [
          insp.customerName,
          insp.machineName,
          insp.inspectionId,
        ].join(' ').toLowerCase();
        return hay.includes(search);
      });
    }
    
    return NextResponse.json({ inspections });
  } catch (error) {
    console.error('Recent inspections error:', error);
    return NextResponse.json({ inspections: [], error: error.message });
  }
}
