import { NextResponse } from 'next/server';
import { isRepeatCustomer } from '../../../lib/sheets';

export async function POST(request) {
  try {
    const { email, phone } = await request.json();
    
    if (!email && !phone) {
      return NextResponse.json({ isRepeat: false });
    }
    
    const repeat = await isRepeatCustomer(email, phone);
    return NextResponse.json({ isRepeat: repeat });
  } catch (err) {
    console.error('Customer check error:', err);
    // Fail safe — if check fails, don't apply discount but don't block booking either
    return NextResponse.json({ isRepeat: false });
  }
}
