import type { ComponentProps } from 'react'
import { Button } from './button'
import { Tooltip } from './tooltip'

type IconButtonProps = Omit<ComponentProps<typeof Button>, 'aria-label' | 'size'> & {
  label: string
  size?: 'icon' | 'iconSm'
  tooltip?: boolean
}

export function IconButton({
  label,
  size = 'icon',
  variant = 'ghost',
  tooltip = true,
  ...props
}: IconButtonProps) {
  const button = <Button aria-label={label} size={size} variant={variant} {...props} />
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
