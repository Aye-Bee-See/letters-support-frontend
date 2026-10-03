/** Whether two pen names are one name, as the API compares them: case and spacing aside (PenName.keyOf). */
export const samePenName = (a: string, b: string) => fold(a) === fold(b)

const fold = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()
