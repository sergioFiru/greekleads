'use client'

// ── Google Translate × React ───────────────────────────────────────────
//
// Translating the page in Chrome and then navigating crashes the whole app:
//
//   Uncaught NotFoundError: Failed to execute 'removeChild' on 'Node':
//   The node to be removed is not a child of this node.
//
// Google Translate rewrites the DOM in place — it replaces a text node with a
// <font> element holding the translation. React still holds a reference to the
// ORIGINAL text node, so when it later unmounts that subtree it asks a parent
// to remove a child that is no longer there, and the exception takes down the
// React tree.
//
// This is facebook/react#11538, open since 2017. It fires on any bare text node
// React owns, which in this codebase means every `{cond ? 'Α' : 'Β'}` — about
// twenty components. Wrapping each in a <span> is the textbook fix, but nothing
// stops the next ternary reintroducing it, so this guards the two DOM methods
// instead: one place, and it covers code nobody has written yet.
//
// WHY NOT just disable translation with <meta name="google" content="notranslate">:
// the company pages are a public registry that people outside Greece look up,
// and we rank for company names. Breaking translation for them to avoid a React
// bug is the wrong trade.
//
// Patched at MODULE scope rather than in an effect, so it is in place before
// React commits anything during hydration.

import { useEffect } from 'react'

declare global {
  interface Window { __glTranslatePatched?: boolean }
}

function patch() {
  if (typeof window === 'undefined' || typeof Node !== 'function' || !Node.prototype) return
  // React strict mode mounts twice and HMR re-imports; patching the patch would
  // build a chain of wrappers.
  if (window.__glTranslatePatched) return
  window.__glTranslatePatched = true

  const realRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    // Translate moved it. React's intent — "this node should be gone" — is
    // already satisfied, so return it rather than throwing.
    if (child.parentNode !== this) return child
    return realRemoveChild.call(this, child) as T
  }

  const realInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node, newNode: T, referenceNode: Node | null,
  ): T {
    // Same situation on the insert side: the anchor React wants to insert
    // before has been reparented, so append instead of failing.
    if (referenceNode && referenceNode.parentNode !== this) return newNode
    return realInsertBefore.call(this, newNode, referenceNode) as T
  }
}

patch()

export default function TranslateGuard() {
  // Re-assert after hydration: the module may have been evaluated in a context
  // where `window` was not yet available.
  useEffect(() => { patch() }, [])
  return null
}
