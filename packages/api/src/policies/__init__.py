"""Contextual access policies: deny rules evaluated against live signals.

This module rides on top of the static RBAC layer in :mod:`src.rbac`.
Where RBAC answers *"can role X call skill Y?"*, policies answer
*"...given that the room is 32°C and a child is in view?"*.

Signals are defined in code (see :mod:`src.policies.signals`); rules
themselves live in the ``policies`` table and are CRUDed via the REST
surface in :mod:`src.policies.router`.
"""
