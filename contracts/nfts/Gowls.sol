// SPDX-License-Identifier: MIT

/*********************************
 *                                *
 *              0,0               *
 *                                *
 *********************************/

pragma solidity 0.8.14;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC721Enumerable.sol";
import "./IGowlDescriptor.sol";

contract Gowls is ERC721Enumerable, Ownable {
    event SeedUpdated(uint256 indexed tokenId, uint256 seed);

    mapping(uint256 => uint256) internal seeds;
    IGowlDescriptor public descriptor;
    uint256 public maxSupply = 10000;
    bool public canUpdateSeed = true;

    constructor(IGowlDescriptor newDescriptor) ERC721("Gowls", "HOOT") {
        descriptor = newDescriptor;
    }

    function mint(uint32 count) external payable {
        uint256 nextTokenId = _owners.length;
        unchecked {
            require(nextTokenId + count < maxSupply, "Exceeds max supply");
        }

        for (uint32 i; i < count; ) {
            seeds[nextTokenId] = generateSeed(nextTokenId);
            _mint(_msgSender(), nextTokenId);
            unchecked {
                ++nextTokenId;
                ++i;
            }
        }
    }

    function setDescriptor(IGowlDescriptor newDescriptor) external onlyOwner {
        descriptor = newDescriptor;
    }

    function withdraw() external payable onlyOwner {
        (bool os, ) = payable(owner()).call{ value: address(this).balance }("");
        require(os, "failed");
    }

    function updateSeed(uint256 tokenId, uint256 seed) external onlyOwner {
        require(canUpdateSeed, "Cannot set the seed");
        seeds[tokenId] = seed;
        emit SeedUpdated(tokenId, seed);
    }

    function disableSeedUpdate() external onlyOwner {
        canUpdateSeed = false;
    }

    function burn(uint256 tokenId) public {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "Not approved to burn"
        );
        delete seeds[tokenId];
        _burn(tokenId);
    }

    function getSeed(uint256 tokenId) public view returns (uint256) {
        require(_exists(tokenId), "Gowl does not exist");
        return seeds[tokenId];
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "Gowl does not exist");
        uint256 seed = seeds[tokenId];
        return descriptor.tokenURI(tokenId, seed);
    }

    function generateSeed(uint256 tokenId) private view returns (uint256) {
        uint256 r = random(tokenId);
        uint256 headSeed = 100 * ((r % 7) + 10) + (((r >> 48) % 20) + 10);
        uint256 faceSeed = 100 *
            (((r >> 96) % 6) + 10) +
            (((r >> 96) % 20) + 10);
        uint256 bodySeed = 100 *
            (((r >> 144) % 7) + 10) +
            (((r >> 144) % 20) + 10);
        uint256 legsSeed = 100 *
            (((r >> 192) % 2) + 10) +
            (((r >> 192) % 20) + 10);
        return
            10000 *
            (10000 * (10000 * headSeed + faceSeed) + bodySeed) +
            legsSeed;
    }

    function random(
        uint256 tokenId
    ) private view returns (uint256 pseudoRandomness) {
        pseudoRandomness = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), tokenId))
        );

        return pseudoRandomness;
    }
}
