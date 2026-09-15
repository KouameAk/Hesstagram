// Clés fixes, UNIQUEMENT pour tester à la main : ça évite d'avoir à copier
// des clés publiques entre deux terminaux à chaque essai. En vrai, chaque
// utilisateur génère les siennes une fois avec createKeys() (voir src/crypto/chiffrement.js)
// et ne partage que sa publicKey.
export const MDP_DEMO = 'mdp-de-demo';

export const CLES_DEMO = {
  alice: {
    publicKey: 'MCowBQYDK2VuAyEAViyjkAzGyru2TYpfXLI7YKv3SewZc2gDYikG1z/P3yQ=',
    privateKey: 'MC4CAQAwBQYDK2VuBCIEIAC+j8JCAt3hMIB8SL89gBb+UPQArCL9BbOXFz3vtc9p',
  },
  bob: {
    publicKey: 'MCowBQYDK2VuAyEAuqBvgklGMCzjQzTFBetkVP8gZ4N48ultDCvUgo7xd3U=',
    privateKey: 'MC4CAQAwBQYDK2VuBCIEIMgpn5QW1aZUaKGMoPpCaOmJOO9eKp2XHvV0MBfzmcFO',
  },
  charlie: {
    publicKey: 'MCowBQYDK2VuAyEAwouqFStZLZWIqT1YFSvjFEELj5G2DNmY3lok8kGk+CA=',
    privateKey: 'MC4CAQAwBQYDK2VuBCIEILh32AZqbDZFLlIkTbaU4iNnd02UEA/4ETJPgfqeSBRV',
  },
};
