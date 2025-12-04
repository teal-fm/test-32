import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaFeedDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.tidString(),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("fm.teal.alpha.feed.play"),
    /**
     * Array of Musicbrainz artist IDs. Prefer using 'artists'.
     */
    artistMbIds: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
    ),
    /**
     * Array of artist names in order of original appearance. Prefer using 'artists'.
     */
    artistNames: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(
        /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
          /*#__PURE__*/ v.stringLength(1, 256),
          /*#__PURE__*/ v.stringGraphemes(0, 2560),
        ]),
      ),
    ),
    /**
     * Array of artists in order of original appearance.
     */
    get artists() {
      return /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.array(FmTealAlphaFeedDefs.artistSchema),
      );
    },
    /**
     * The length of the track in seconds
     */
    duration: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
    /**
     * The ISRC code associated with the recording
     */
    isrc: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The base domain of the music service. e.g. music.apple.com, tidal.com, spotify.com. Defaults to 'local' if unavailable or not provided.
     */
    musicServiceBaseDomain: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The URL associated with this track
     */
    originUrl: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The unix timestamp of when the track was played
     */
    playedTime: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
    /**
     * The Musicbrainz recording ID of the track
     */
    recordingMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The Musicbrainz release ID
     */
    releaseMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The name of the release/album
     * @maxLength 256
     * @maxGraphemes 2560
     */
    releaseName: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
        /*#__PURE__*/ v.stringLength(0, 256),
        /*#__PURE__*/ v.stringGraphemes(0, 2560),
      ]),
    ),
    /**
     * A metadata string specifying the user agent where the format is `<app-identifier>/<version> (<kernel/OS-base>; <platform/OS-version>; <device-model>)`. If string is provided, only `app-identifier` and `version` are required. `app-identifier` is recommended to be in reverse dns format. Defaults to 'manual/unknown' if unavailable or not provided.
     * @maxLength 256
     * @maxGraphemes 2560
     */
    submissionClientAgent: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
        /*#__PURE__*/ v.stringLength(0, 256),
        /*#__PURE__*/ v.stringGraphemes(0, 2560),
      ]),
    ),
    /**
     * The Musicbrainz ID of the track
     */
    trackMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The name of the track
     * @minLength 1
     * @maxLength 256
     * @maxGraphemes 2560
     */
    trackName: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(1, 256),
      /*#__PURE__*/ v.stringGraphemes(0, 2560),
    ]),
  }),
);

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "fm.teal.alpha.feed.play": mainSchema;
  }
}
