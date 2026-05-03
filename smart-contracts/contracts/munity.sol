// SPDX-License-Identifier: MIT

/// Company: Decrypted Labs
/// @title  Munity
/// @author Rabeeb Aqdas
/// @notice A contract for creating and managing communities within an ERC1155 and ERC2981 compliant system.
/// @dev Incorporates ERC1155 for NFTs and ERC2981 for royalty management, and allows users to create and manage their own communities with pricing and discount mechanisms.

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Error thrown when a zero price is set for a community or item.
error PriceCantBeZero();

/// @notice Error thrown when a zero supply is set for a community or item.
error SupplyCantBeZero();

/// @notice Error thrown when an invalid discount rate is provided.
error InvalidDiscount();

/// @notice Error thrown when the amount of funds provided is less than the required price.
/// @param _reqPrice The required price that was not met by the provided funds.
error MoneyNotEnough(uint256 _reqPrice);

/// @notice Error thrown when an operation exceeds the available supply in a community.
/// @param _supply The current supply available in the community which is insufficient for the requested operation.
error NotEnoughSupply(uint256 _supply);

/// @notice Error thrown when a value exceeds a predefined limit.
/// @param _limit The limit that was exceeded.
error LimitExceeded(uint256 _limit);

/// @notice Error thrown when a transfer of funds fails.
error TransferFailed();

/// @notice Error thrown when an action is attempted on a community that is not registered or does not exist.
error CommunityNotRegistered();

contract  Munity is ERC1155, ERC2981, Ownable {

    /// @notice Represents a community with specific attributes including pricing and whitelist.
    /// @dev Stores details about each community including its price, discount rate, creator, URI, and a whitelist.
    struct Community {
        uint256 price; // The price for participating in the community.
        uint256 supply; // The supply for minting the NFT.
        uint256 discount; // The discount rate for whitelisted users.
        address creator; // The creator's address of the community.
        string uri; // URI for the community's metadata.
        mapping(address => bool) whitelist; // Mapping of user addresses to their whitelist status.
    }

    /// @dev Base constant used for percentage calculations.
    uint256 private constant BASE = 1000; 

    /// @dev A constant representing a predefined minting limit for each community.
    uint256 private constant LIMIT = 50; 

    /// @notice Counter for the next community ID.
    uint256 private _nextId;

    /// @dev Stores the fee associated with community actions.
    uint256 private communityFee;   

    /// @dev A constant representing a predefined royalty fee for each community.
    uint96 private constant ROYALTYFEE = 350; 

    /// @dev Name of the contract or platform.
    string private _name;

    /// @dev Symbol of the contract or platform.
    string private _symbol; 

    /// @dev Mapping of community IDs to their respective Community struct.
    mapping(uint256 _id => Community) private _communities;

    /// @dev A mapping to track the number of tokens minted by each user in each community.
    mapping(address _user => mapping(uint256 _id => uint256)) private _mintings;

    /// @notice Emitted when a new community is registered in the contract.
    /// @param _id The ID of the newly registered community.
    /// @param _by The address of the creator who registered the community.
    event CommunityRegistered(address indexed _by, uint256 _id);

    /// @notice Emitted when the uri of a community is changed.
    /// @param _id The ID of the community whose uri was changed.
    /// @param _newUri The new uri of the community.
    event UriChanged(uint256 _id, string _newUri);

    /// @notice Emitted when the price of a community is changed.
    /// @param _id The ID of the community whose price was changed.
    /// @param _oldPrice The old price of the community.
    /// @param _newPrice The new price of the community.
    event PriceChanged(uint256 _id, uint256 _oldPrice, uint256 _newPrice);

    /// @notice Emitted when the platform fee is changed.
    /// @param _oldFee The old platform fee.
    /// @param _newFee The new platform fee.
    event FeeChanged(uint256 _oldFee, uint256 _newFee);

    /// @notice Emitted when the discount rate of a community is changed.
    /// @param _id The ID of the community whose discount was changed.
    /// @param _oldDiscount The old discount rate of the community.
    /// @param _newDiscount The new discount rate of the community.
    event DiscountChanged(uint256 _id, uint256 _oldDiscount, uint256 _newDiscount);

    /// @notice Emitted when an item from a community is bought.
    /// @param _id The ID of the community from which the item was bought.
    /// @param _by The address of the buyer.
    /// @param amount The amount of the item purchased.
    event ItemBought(uint256 _id, address _by, uint256 amount);

    /// @notice Modifier that restricts function access to the creator of a specific community.
    /// @param _user The address of the user attempting to perform the action.
    /// @param _id The ID of the community related to the action.
    modifier isCreator(address _user, uint256 _id) {
        if(_communities[_id].creator == address(0)) revert CommunityNotRegistered();
        require(_communities[_id].creator == _user, "Not a Creator");
        _;
    }

    /// @notice Fallback function to accept Ether payments.
    receive() external payable { }

    /// @notice Constructor to initialize the  Munity contract with default values.
    /// @dev Sets up contract with initial settings including name, symbol, and platform fee recipient.
    constructor() ERC1155("") Ownable(_msgSender()) {
        _name = " Munity";
        _symbol = "MU";
        communityFee = 36;
    }

    /// @notice Allows users to buy items from communities using the specified currency.
    /// @dev Handles payment, including discounts for whitelisted users, and mints the purchased item.
    /// @param _id The community ID from which the user is buying.
    /// @param _amount The number of items to buy.
    function buy(uint256 _id, uint256 _amount) external payable {
       (uint256 price, uint256 supply, uint256 discount, address creator) = getCommunityDetails(_id);
        if(price == 0) revert CommunityNotRegistered();
        address sender = _msgSender();
        if(_mintings[sender][_id] + _amount > LIMIT) revert LimitExceeded(LIMIT);
        if(_amount > supply) revert NotEnoughSupply(supply);

        if(sender != creator) {   
        if(isWhiteListed(_id , sender)) price = discount == BASE ? 0 : price - ((price * discount) / BASE);
        uint256 value = msg.value;
        uint256 totalAmt = price * _amount;
        if(value < totalAmt) revert MoneyNotEnough(totalAmt);   
        uint256 amountToBeReturn = value - totalAmt;    
        uint256 _communityFee = (totalAmt * communityFee) / BASE;
        (bool success, ) = payable(creator).call{value: (totalAmt - _communityFee)}("");
        (bool success1, ) = payable(owner()).call{value: _communityFee}("");
        if(!success || !success1) revert TransferFailed();
        if(amountToBeReturn > 0) {
        (bool success2, ) = payable(sender).call{value: amountToBeReturn}("");
        if(!success2) revert TransferFailed();
        }
        }     

        _mint(sender, _id, _amount, "");
        _communities[_id].supply -= _amount;  
        _mintings[sender][_id] += _amount;
        emit ItemBought(_id, sender, _amount);    
    }

    /// @notice Registers a new community with specified price, discount, and URI.
    /// @dev Creates a new community and sets its parameters, including creator's address.
    /// @param _price The initial price for the community's items or services.
    /// @param _supply The initial supply of NFT for the community.
    /// @param _discount The discount rate in percent for whitelisted users.
    /// @param _uri The URI containing metadata for the community.
    function registerCommunity(uint256 _price, uint256 _supply, uint256 _discount, string memory _uri) external {
        if(_price == 0) revert PriceCantBeZero();
        if(_supply == 0) revert SupplyCantBeZero();
        if(_discount > BASE) revert InvalidDiscount();
        _nextId++;
        uint256 _id = _nextId;
        address sender = _msgSender();

        Community storage _community = _communities[_id];
        _community.price = _price;
        _community.supply = _supply;
        _community.creator = sender;
        _community.uri = _uri;
        _community.discount = _discount;
        _setTokenRoyalty(_id, sender, ROYALTYFEE);
       emit CommunityRegistered( sender,_id);
    }

    /// @notice Allows a community creator to change the uri of their community.
    /// @dev Modifies the uri of a specific community.
    /// @param _id The ID of the community to be updated.
    /// @param _newUri The URI containing metadata for the community.
    function changeUri(uint256 _id, string memory _newUri) external isCreator(_msgSender(), _id) {
        _communities[_id].uri = _newUri;
        emit UriChanged(_id, _newUri);
    }

    /// @notice Allows a community creator to change the price of their community.
    /// @dev Modifies the price of a specific community, ensuring the new price is not zero.
    /// @param _id The ID of the community to be updated.
    /// @param _newPrice The new price for the community.
    function changePrice(uint256 _id, uint256 _newPrice) external isCreator(_msgSender(), _id) {
        if(_newPrice == 0) revert PriceCantBeZero();
        emit PriceChanged(_id, _communities[_id].price, _newPrice);
        _communities[_id].price = _newPrice;
    }

    /// @notice Increases the supply for a specific community.
    /// @dev Only the creator of the community can increase its supply.
    /// @param _id The ID of the community for which to increase the supply.
    /// @param _supply The amount by which to increase the supply.
    function addSupply(uint256 _id, uint256 _supply) external isCreator(_msgSender(), _id) {
        if(_supply == 0) revert SupplyCantBeZero();
        _communities[_id].supply += _supply;
    }

    /// @notice Allows a community creator to change the discount rate for their community.
    /// @dev Modifies the discount rate of a specific community.
    /// @param _id The ID of the community to be updated.
    /// @param _discount The new discount rate in percent.
    function changeDiscount(uint256 _id, uint256 _discount) external isCreator(_msgSender(), _id) {
        if(_discount > BASE) revert InvalidDiscount();
        emit DiscountChanged(_id, _communities[_id].discount, _discount);
        _communities[_id].discount = _discount;
    }

    /// @notice Allows a platform creator to change the fees of the platform.
    /// @dev Modifies the fees of platform.
    /// @param _newFees The new platform fee in percent.
    function changeCommunityFee(uint256 _newFees) external onlyOwner {
        emit FeeChanged(communityFee, _newFees);
        communityFee = _newFees;
    }

    /// @notice Adds users to a community's whitelist.
    /// @dev Adds multiple addresses to the whitelist of a specific community.
    /// @param _id The ID of the community where users are being whitelisted.
    /// @param _addresses An array of addresses to be whitelisted.
    function addWhiteListing(uint256 _id, address[] memory _addresses) external isCreator(_msgSender(), _id) {
        for(uint256 i; i < _addresses.length ; i = unsafe_inc(i)) {
        _communities[_id].whitelist[_addresses[i]] = true;
    }
    }

    /// @notice Removes users from a community's whitelist.
    /// @dev Removes multiple addresses from the whitelist of a specific community.
    /// @param _id The ID of the community where users are being removed from the whitelist.
    /// @param _addresses An array of addresses to be removed from the whitelist.
    function removeWhiteListing(uint256 _id, address[] memory _addresses) external isCreator(_msgSender(), _id) {
        for(uint256 i; i < _addresses.length ; i = unsafe_inc(i)) {
        _communities[_id].whitelist[_addresses[i]] = false;
    }
    }

    /// @notice Returns the URI for a given community's metadata.
    /// @param _id The community ID for which the URI is requested.
    /// @return The URI of the specified community.
    function uri(uint256 _id) public view override returns (string memory) {
        return _communities[_id].uri;
    }

    /// @notice Retrieves the number of tokens minted by a specific user in a specific community.
    /// @dev Returns the count of tokens minted by the user identified by `_user` in the community identified by `_id`.
    /// @param _user The address of the user whose minting record is being queried.
    /// @param _id The ID of the community for which the minting record is being queried.
    /// @return The number of tokens minted by the user in the specified community.
    function getMinting(address _user, uint256 _id) external view returns (uint256) {
        return _mintings[_user][_id];
    }

    /// @notice Returns the name of the Munity contract.
    /// @return The name of the contract.
    function name() external view returns (string memory) {
        return _name;
    }

    /// @notice Returns the symbol of the Munity contract.
    /// @return The symbol of the contract.
    function symbol() external view returns (string memory) {
        return _symbol;
    } 

    /// @notice Retrieves the current community fee.
    /// @return The current community fee.
    function getCommunityFee() external view returns (uint256) {
        return communityFee;
    }

    /// @notice Retrieves the total number of communities registered.
    /// @return The total number of communities.
    function totalCommunities() external view returns (uint256) {
        return _nextId;
    }

    /// @notice Checks if a given address is whitelisted in a specific community.
    /// @param _id The ID of the community.
    /// @param _address The address to check for whitelisting.
    /// @return True if the address is whitelisted in the community, false otherwise.
    function isWhiteListed(uint256 _id, address _address) public view returns (bool) {
        return _communities[_id].whitelist[_address];
    }
 
    /// @notice Retrieves details of a specific community.
    /// @param _id The ID of the community to retrieve details for.
    /// @return price The price associated with the community.
    /// @return supply The total supply of items or services in the community.
    /// @return discount The discount rate for the community.
    /// @return creator The address of the creator of the community.
    function getCommunityDetails(uint256 _id) public view returns (        
        uint256 price, 
        uint256 supply,
        uint256 discount,
        address creator)
    {
        Community storage _community = _communities[_id];
        price = _community.price;
        supply = _community.supply;
        discount = _community.discount;
        creator = _community.creator;
    }  

    /// @notice Increments a uint256 value by 1, without checking for overflow.
    /// @dev This function uses unchecked arithmetic to increment, for gas efficiency in loops.
    /// @param i The uint256 value to be incremented.
    /// @return The incremented value.
    function unsafe_inc(uint256 i) internal pure returns(uint256) {
    unchecked {
        return  i + 1;
    }
    }

    /// @notice Supports interface implementation as per ERC1155 and ERC2981 standards.
    /// @param interfaceId The interface ID to check.
    /// @return True if the interface is supported, false otherwise.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

}
 