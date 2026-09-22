import type { Ref } from 'preact'
import type { Item } from '../commands'

// One line of the list. Selection is drawn by the gliding cursor, not by the row.
export function Row(props: { item: Item; selected: boolean; rowRef?: Ref<HTMLLIElement>; onPick: () => void; onHover: () => void }) {
  const { item } = props
  if (item.kind === 'section') {
    return (
      <li class="sec" role="presentation">
        <span>{item.label}</span>
        {item.count !== undefined && <span class="sec-count">{item.count}</span>}
      </li>
    )
  }
  const common = {
    ref: props.rowRef,
    role: 'option' as const,
    'aria-selected': props.selected,
    class: `row ${props.selected ? 'sel' : ''}`,
    onClick: props.onPick,
    onMouseMove: props.onHover,
  }
  if (item.kind === 'window') {
    return (
      <li {...common}>
        <span class={item.on ? 'glyph live' : 'glyph'} aria-hidden="true" />
        <span class="main">
          <span class="label">{item.label}</span>
          <span class="sub">{item.sub}</span>
        </span>
        <span class="hint">{item.hint}</span>
        <span class="chev" aria-hidden="true">›</span>
      </li>
    )
  }
  return (
    <li {...common} class={`${common.class} ${item.danger ? 'danger' : ''}`}>
      <span class="main">
        <span class="label">{item.label}</span>
      </span>
      {item.step ? (
        <span class="value stepper">
          <span class="arrow">‹</span>
          {item.value}
          <span class="arrow">›</span>
        </span>
      ) : item.value !== undefined ? (
        <span class="value dim">{item.value}</span>
      ) : null}
      {item.on !== undefined && <span class={item.on ? 'switch on' : 'switch'} role="switch" aria-checked={item.on} />}
    </li>
  )
}
