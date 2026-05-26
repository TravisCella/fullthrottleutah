'use client';

export default function CancellationPolicy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0b1622',
      color: '#e8edf2',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Hero */}
      <div style={{
        padding: '80px 24px 60px',
        textAlign: 'center',
        background: 'linear-gradient(170deg, #0d1f33 0%, #0b1622 60%)',
        position: 'relative',
      }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(0,180,216,0.12)',
          border: '1px solid rgba(0,180,216,0.3)',
          color: '#00b4d8',
          fontWeight: 600,
          fontSize: '13px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          padding: '6px 18px',
          borderRadius: '40px',
          marginBottom: '20px',
        }}>Policies</div>
        <h1 style={{
          fontWeight: 800,
          fontSize: 'clamp(2rem, 6vw, 3.2rem)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          lineHeight: 1.1,
          marginBottom: '16px',
          margin: '0 auto 16px',
        }}>
          Cancellation &amp;<br />
          <span style={{ color: '#00b4d8' }}>Weather Policy</span>
        </h1>
        <p style={{
          maxWidth: '560px',
          margin: '0 auto',
          color: '#8a9bb0',
          fontSize: '1.05rem',
          lineHeight: 1.7,
        }}>
          We want you on the water — not worrying about what-ifs. Here&apos;s how we handle cancellations and Mother Nature.
        </p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 24px 80px' }}>

        {/* General Cancellations */}
        <div style={{ marginTop: '48px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: '#00b4d8',
            marginBottom: '12px',
          }}>
            <span style={{
              width: '8px', height: '8px',
              borderRadius: '50%',
              background: '#00b4d8',
              boxShadow: '0 0 8px #00b4d8',
              display: 'inline-block',
            }} />
            General Cancellations
          </div>
          <h2 style={{
            fontWeight: 700,
            fontSize: '1.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '20px',
          }}>Need to Change Plans?</h2>
          <p style={{ color: '#8a9bb0', marginBottom: '20px', lineHeight: 1.7 }}>
            We get it — things come up. Here&apos;s our cancellation schedule for non-weather-related changes:
          </p>

          {/* Tier Cards */}
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* 48+ hours */}
            <div style={{
              background: '#162536',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '24px 28px',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '10px',
                background: 'rgba(46,196,182,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}>✓</div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Full Refund <span style={{ color: '#8a9bb0', fontWeight: 600, marginLeft: '6px', fontSize: '0.85rem' }}>48+ hours before</span>
                </h3>
                <p style={{ color: '#8a9bb0', fontSize: '0.95rem', marginTop: '4px', lineHeight: 1.6 }}>
                  Cancel at least 48 hours before your reservation and you&apos;ll receive a full refund to your original payment method.
                </p>
              </div>
            </div>

            {/* 24-48 hours */}
            <div style={{
              background: '#162536',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '24px 28px',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '10px',
                background: 'rgba(247,127,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}>↻</div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  50% Refund or Full Credit <span style={{ color: '#8a9bb0', fontWeight: 600, marginLeft: '6px', fontSize: '0.85rem' }}>24–48 hours</span>
                </h3>
                <p style={{ color: '#8a9bb0', fontSize: '0.95rem', marginTop: '4px', lineHeight: 1.6 }}>
                  Cancel within 24–48 hours and choose between a 50% refund or a full credit toward a future booking this season.
                </p>
              </div>
            </div>

            {/* Under 24 hours */}
            <div style={{
              background: '#162536',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '24px 28px',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '10px',
                background: 'rgba(230,57,70,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}>✕</div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  No Refund <span style={{ color: '#8a9bb0', fontWeight: 600, marginLeft: '6px', fontSize: '0.85rem' }}>Under 24 hrs / No-show</span>
                </h3>
                <p style={{ color: '#8a9bb0', fontSize: '0.95rem', marginTop: '4px', lineHeight: 1.6 }}>
                  Cancellations less than 24 hours before your reservation or no-shows are non-refundable. We turn away other riders to hold your spot.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Weather Policy */}
        <div style={{ marginTop: '48px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: '#00b4d8',
            marginBottom: '12px',
          }}>
            <span style={{
              width: '8px', height: '8px',
              borderRadius: '50%',
              background: '#00b4d8',
              boxShadow: '0 0 8px #00b4d8',
              display: 'inline-block',
            }} />
            Inclement Weather
          </div>
          <h2 style={{
            fontWeight: 700,
            fontSize: '1.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '20px',
          }}>What Happens When the Weather Turns?</h2>
          <p style={{ color: '#8a9bb0', marginBottom: '16px', lineHeight: 1.7 }}>
            Your safety is our top priority. If Full Throttle Utah determines that conditions are unsafe, we&apos;ll reach out and offer you two options:
          </p>

          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{
              background: '#162536',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '24px 28px',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '10px',
                background: 'rgba(46,196,182,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}>📅</div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Free Reschedule</h3>
                <p style={{ color: '#8a9bb0', fontSize: '0.95rem', marginTop: '4px', lineHeight: 1.6 }}>
                  Move your reservation to another available date this season at no additional cost.
                </p>
              </div>
            </div>

            <div style={{
              background: '#162536',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '24px 28px',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '10px',
                background: 'rgba(46,196,182,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}>🎟️</div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Season Credit</h3>
                <p style={{ color: '#8a9bb0', fontSize: '0.95rem', marginTop: '4px', lineHeight: 1.6 }}>
                  Receive a full credit valid through the end of the current season. Use it yourself or pass it along to someone else.
                </p>
              </div>
            </div>
          </div>

          {/* What counts as unsafe */}
          <div style={{
            marginTop: '28px',
            background: 'rgba(0,180,216,0.06)',
            borderLeft: '3px solid #00b4d8',
            borderRadius: '0 10px 10px 0',
            padding: '20px 24px',
          }}>
            <strong>What counts as unsafe conditions?</strong>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginTop: '20px',
          }}>
            {[
              { icon: '⛈️', label: 'Thunderstorms & Lightning' },
              { icon: '💨', label: 'Sustained Winds Over 20 mph' },
              { icon: '🌧️', label: 'Heavy Rain Reducing Visibility' },
              { icon: '🚫', label: 'Reservoir Closures or Advisories' },
            ].map((c, i) => (
              <div key={i} style={{
                background: '#162536',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}>
                <span style={{ fontSize: '26px', flexShrink: 0, width: '40px', textAlign: 'center' }}>{c.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.92rem', lineHeight: 1.4 }}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* Light rain warning */}
          <div style={{
            marginTop: '20px',
            background: 'rgba(247,127,0,0.06)',
            borderLeft: '3px solid #f77f00',
            borderRadius: '0 10px 10px 0',
            padding: '20px 24px',
          }}>
            <strong>Light rain &amp; overcast skies do not qualify.</strong>
            <p style={{ color: '#8a9bb0', fontSize: '0.95rem', marginTop: '4px', lineHeight: 1.6 }}>
              Jet skis are perfectly safe and a blast in light rain. We don&apos;t cancel based on weather forecasts alone — decisions are made the morning of your reservation based on actual conditions at the water.
            </p>
          </div>
        </div>

        {/* Mid-Rental Weather */}
        <div style={{ marginTop: '48px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: '#00b4d8',
            marginBottom: '12px',
          }}>
            <span style={{
              width: '8px', height: '8px',
              borderRadius: '50%',
              background: '#00b4d8',
              boxShadow: '0 0 8px #00b4d8',
              display: 'inline-block',
            }} />
            Mid-Rental Weather
          </div>
          <h2 style={{
            fontWeight: 700,
            fontSize: '1.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '20px',
          }}>If Weather Hits While You&apos;re Out</h2>
          <p style={{ color: '#8a9bb0', marginBottom: '24px', lineHeight: 1.7 }}>
            Utah reservoir weather can change fast. If severe weather develops during your rental, here&apos;s what happens:
          </p>

          {/* Steps */}
          <div style={{ display: 'grid', gap: '0' }}>
            {[
              { num: '1', title: 'Return to Shore', desc: 'Head back to the launch point immediately. Safety first, always.' },
              { num: '2', title: 'We Pause Your Clock', desc: 'Your rental time stops while we wait for conditions to improve. No time lost.' },
              { num: '3', title: 'Back on the Water — Or Credited', desc: "Once it's safe, your remaining time restarts. If conditions don't improve, we'll issue a prorated credit for your unused time." },
            ].map((step, i, arr) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr',
                gap: '0 16px',
                paddingBottom: i < arr.length - 1 ? '24px' : '0',
              }}>
                <div style={{
                  width: '36px', height: '36px',
                  borderRadius: '50%',
                  background: '#00b4d8',
                  color: '#0b1622',
                  fontWeight: 800,
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}>
                  {step.num}
                  {i < arr.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '2px',
                      height: '48px',
                      background: 'rgba(0,180,216,0.2)',
                    }} />
                  )}
                </div>
                <div>
                  <h4 style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginTop: '6px',
                  }}>{step.title}</h4>
                  <p style={{ color: '#8a9bb0', fontSize: '0.93rem', marginTop: '4px', lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '56px',
          paddingTop: '32px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center',
        }}>
          <div style={{
            fontWeight: 800,
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}>
            Full Throttle <span style={{ color: '#00b4d8' }}>Utah</span>
          </div>
          <p style={{ color: '#8a9bb0', fontSize: '0.88rem' }}>
            Questions about a reservation or the weather at your lake?<br />Reach out — we&apos;re happy to help.
          </p>
          <a href="/" style={{
            display: 'inline-block',
            marginTop: '24px',
            padding: '14px 36px',
            background: '#00b4d8',
            color: '#0b1622',
            fontWeight: 700,
            fontSize: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            textDecoration: 'none',
            borderRadius: '8px',
          }}>Book Now</a>
          <p style={{ marginTop: '10px', fontSize: '0.82rem', color: '#8a9bb0' }}>
            Policy effective May 25, 2026 · Subject to change without notice
          </p>
        </div>
      </div>
    </div>
  );
}
