export function S24WidgetPage({ extraRows = 0 }: { extraRows?: number }) {
  const extraHeight = extraRows * 65;
  return (
    <g className="s24-widget-page" fill="#e4e4ec">
      <rect x="231" y="408" width="657" height={874 + extraHeight} rx="49" fill="#1e1e27" />
      <g fontSize="25">
        <text x="263" y="459" fontWeight="700">
          EVENING
        </text>
        <text x="582" y="459" fill="#aaaabb">
          Tuesday, 27 October
        </text>
        <text x="832" y="459">
          ⟳
        </text>
      </g>
      <rect x="252" y="490" width="615" height="367" rx="32" fill="#262633" />
      <text x="278" y="540" fontSize="31" fontWeight="700">
        ▣ Engelsrud ⇄ Asker
      </text>
      <text x="277" y="575" fontSize="22" fontWeight="700">
        → Asker
      </text>
      <rect x="277" y="584" width="70" height="44" rx="17" fill="#ce0052" />
      <text x="312" y="616" fontSize="25" fontWeight="700" textAnchor="middle">
        280
      </text>
      <text x="278" y="662" fontSize="30">
        00:22
      </text>
      <text x="278" y="692" fontSize="21">
        15 min
      </text>
      <text x="277" y="723" fontSize="22" fontWeight="700">
        → Engelsrud
      </text>
      {[
        ['00:17', '10 min'],
        ['00:37', '30 min'],
        ['00:57', '50 min'],
      ].map(([time, wait], index) => (
        <g key={time} transform={`translate(${277 + index * 141} 731)`}>
          <rect width="70" height="44" rx="17" fill="#ce0052" />
          <text x="35" y="32" fontSize="25" fontWeight="700" textAnchor="middle">
            280
          </text>
          <text y="79" fontSize="30">
            {time}
          </text>
          <text y="109" fontSize="21">
            {wait}
          </text>
        </g>
      ))}
      <rect x="252" y="870" width="615" height={122 + extraHeight} rx="32" fill="#262633" />
      <text x="278" y="919" fontSize="31" fontWeight="700">
        ▢ Upcoming agenda
      </text>
      {extraRows === 0 ? (
        <text x="277" y="969" fontSize="27">
          Nothing scheduled this week
        </text>
      ) : (
        Array.from({ length: extraRows }, (_, index) => (
          <text key={index} x="277" y={969 + index * 65} fontSize="27">
            {9 + index}:00 · Example event
          </text>
        ))
      )}
      <g transform={`translate(0 ${extraHeight})`}>
        <rect x="252" y="1006" width="615" height="255" rx="32" fill="#262633" />
        <text x="280" y="1074" fontSize="42" fill="#ffc45c">
          ☾
        </text>
        <text x="345" y="1056" fontSize="29" fontWeight="700">
          Dry until 02:00
        </text>
        <text x="345" y="1087" fontSize="23" fill="#aaaabb">
          Umbrella for later
        </text>
        {['Now', '01', '02', '03', '04'].map((time, index) => (
          <g key={time} transform={`translate(${329 + index * 105} 1133)`} textAnchor="middle">
            <text fontSize="20" fill="#aaaabb">
              {time}
            </text>
            <text y="42" fontSize="32">
              {index === 0 ? '☾' : '☁'}
            </text>
            <text y="73" fontSize="23">
              {index < 2 ? '5°' : '6°'}
            </text>
            {index > 1 && (
              <text y="104" fontSize="21" fill="#aaaabb">
                {['', '', '0.6', '1.0', '0.8'][index]}
              </text>
            )}
          </g>
        ))}
      </g>
    </g>
  );
}
