"""RBAC users: CRUD + face image enrollment.

The face-embedding column stays NULL on this side. Embeddings are computed
by the dimos enrollment job (TODO) reading the face images from the shared
`/faces` volume — keeping the dlib/face_recognition dependency out of this
container.
"""
