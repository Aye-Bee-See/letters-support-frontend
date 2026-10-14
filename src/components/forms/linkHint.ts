import { Children, cloneElement, isValidElement, type ReactNode } from 'react'

/** The id a Field gives its hint: the control's id plus "-hint". */
export const hintId = (htmlFor: string) => `${htmlFor}-hint`

/**
 * A Field's children, with aria-describedby pointing at the hint on the one
 * child whose id is the Field's htmlFor (the input, select or textarea, or a
 * RecordPicker, which passes it on to its input). The other children (a
 * "picked" row, a Clear button) are left as they are.
 */
export function linkHint(children: ReactNode, htmlFor: string, hint: string | undefined): ReactNode {
  if (!hint) return children
  return Children.map(children, (child) => {
    if (!isValidElement<{ id?: string; 'aria-describedby'?: string }>(child) || child.props.id !== htmlFor) return child
    const own = child.props['aria-describedby']
    return cloneElement(child, { 'aria-describedby': own ? `${own} ${hintId(htmlFor)}` : hintId(htmlFor) })
  })
}
