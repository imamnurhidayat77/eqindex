// Browser tab title for this section. Client-component pages can't export
// metadata, so the title lives in this pass-through layout.
export const metadata = { title: { default: 'Classes', template: '%s · Admin · EQIndex' } };

export default function Layout({ children }) {
  return children;
}
